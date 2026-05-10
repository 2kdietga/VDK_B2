import asyncio
import json

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from dashboard.network import resolve_bind_host
from dashboard.state import extract_device_input, get_state, set_device_input


class Command(BaseCommand):
    help = "Run a CoAP server that receives gesture payloads from ESP32."

    def add_arguments(self, parser):
        parser.add_argument("--host", default="auto")
        parser.add_argument("--port", type=int, default=5683)
        parser.add_argument("--path", default="gesture")

    def handle(self, *args, **options):
        command_stdout = self.stdout
        command_style = self.style
        esp32_ip = getattr(settings, "ESP32_IP", "")
        esp32_command_port = getattr(settings, "ESP32_COMMAND_PORT", 5683)
        esp32_command_path = getattr(settings, "ESP32_COMMAND_PATH", "command")
        if not esp32_ip:
            raise CommandError("ESP32_IP trong settings.py dang rong.")

        try:
            import aiocoap.resource as resource
            import aiocoap
            from aiocoap.numbers.contentformat import ContentFormat
        except ImportError as exc:
            raise CommandError(
                "Chua co thu vien aiocoap. Cai bang: pip install aiocoap"
            ) from exc

        class GestureResource(resource.Resource):
            async def render_post(self, request):
                payload = request.payload.decode("utf-8", errors="ignore").strip()
                device_input = extract_device_input(payload)
                state = set_device_input(payload)

                if state is None:
                    return aiocoap.Message(
                        code=aiocoap.BAD_REQUEST,
                        payload=f"Payload khong hop le: {payload!r}".encode("utf-8"),
                    )

                command_stdout.write(
                    "Nhan input: "
                    f"gesture={device_input['gesture']} "
                    f"btn_menu={device_input['btn_menu']} "
                    f"btn_ok={device_input['btn_ok']}"
                )
                return aiocoap.Message(code=aiocoap.CHANGED)

            async def render_put(self, request):
                return await self.render_post(request)

        async def main():
            host = resolve_bind_host(options["host"])
            root = resource.Site()
            root.add_resource([options["path"]], GestureResource())
            protocol = await aiocoap.Context.create_server_context(
                root,
                bind=(host, options["port"]),
            )
            command_stdout.write(
                command_style.SUCCESS(
                    f"CoAP server dang chay tai coap://{host}:{options['port']}/{options['path']}"
                )
            )
            command_stdout.write(
                command_style.SUCCESS(
                    f"ESP32 command target: coap://{esp32_ip}:{esp32_command_port}/{esp32_command_path}"
                )
            )
            asyncio.create_task(send_device_updates(protocol, aiocoap, ContentFormat))
            await asyncio.get_running_loop().create_future()

        async def send_device_updates(protocol, aiocoap, content_format):
            last_sent_version = int(get_state().get("command_version", 0))

            while True:
                await asyncio.sleep(0.25)
                state = get_state()

                command = {
                    "led": int(state.get("led", 0)),
                    "motor": int(state.get("motor", 0)),
                }
                command_version = int(state.get("command_version", 0))

                if command_version == last_sent_version:
                    continue

                uri = (
                    f"coap://{esp32_ip}:{esp32_command_port}/"
                    f"{esp32_command_path}"
                )
                payload = _build_device_payload(command)
                request = aiocoap.Message(
                    code=aiocoap.POST,
                    uri=uri,
                    payload=payload,
                )
                request.opt.content_format = content_format.JSON

                try:
                    command_stdout.write(
                        f"Chuan bi gui ESP32 {uri}: {command} version={command_version}"
                    )
                    response = await asyncio.wait_for(
                        protocol.request(request).response,
                        timeout=5,
                    )
                except asyncio.TimeoutError:
                    command_stdout.write(
                        command_style.WARNING(
                            f"ESP32 khong response sau 5s. URI={uri}, payload={command}"
                        )
                    )
                    continue
                except Exception as exc:
                    command_stdout.write(
                        command_style.WARNING(
                            f"Gui command toi ESP32 loi. URI={uri}, payload={command}, loi={exc}"
                        )
                    )
                    continue

                last_sent_version = command_version
                response_payload = response.payload.decode("utf-8", errors="ignore")
                command_stdout.write(
                    f"Gui ESP32 {uri}: {command} version={command_version} -> {response.code} {response_payload}"
                )

        asyncio.run(main())


def _build_device_payload(state):
    command = {
        "led": int(state.get("led", 0)),
        "motor": int(state.get("motor", 0)),
    }
    return json.dumps(command, separators=(",", ":")).encode("utf-8")
