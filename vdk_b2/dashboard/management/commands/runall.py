import subprocess
import sys
import time

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from dashboard.network import resolve_bind_host


class Command(BaseCommand):
    help = "Run Django dashboard and CoAP gesture server together."

    def add_arguments(self, parser):
        parser.add_argument("--django-host", default="0.0.0.0")
        parser.add_argument("--django-port", type=int, default=8000)
        parser.add_argument("--coap-host", default="auto")
        parser.add_argument("--coap-port", type=int, default=5683)
        parser.add_argument("--coap-path", default="gesture")

    def handle(self, *args, **options):
        django_addr = f"{options['django_host']}:{options['django_port']}"
        coap_host = resolve_bind_host(options["coap_host"])
        coap_addr = f"coap://{coap_host}:{options['coap_port']}/{options['coap_path']}"
        esp32_ip = getattr(settings, "ESP32_IP", "")
        esp32_command_port = getattr(settings, "ESP32_COMMAND_PORT", 5683)
        esp32_command_path = getattr(settings, "ESP32_COMMAND_PATH", "command")
        if not esp32_ip:
            raise CommandError("ESP32_IP trong settings.py dang rong.")

        commands = [
            [
                sys.executable,
                "manage.py",
                "runserver",
                django_addr,
                "--noreload",
            ],
            [
                sys.executable,
                "manage.py",
                "runcoap",
                "--host",
                coap_host,
                "--port",
                str(options["coap_port"]),
                "--path",
                options["coap_path"],
            ],
        ]

        processes = []

        self.stdout.write(self.style.SUCCESS(f"Django dashboard: http://{django_addr}/"))
        self.stdout.write(self.style.SUCCESS(f"CoAP endpoint: {coap_addr}"))
        self.stdout.write(
            self.style.SUCCESS(
                f"ESP32 command: coap://{esp32_ip}:{esp32_command_port}/{esp32_command_path}"
            )
        )
        self.stdout.write("Nhan Ctrl+C de tat ca Django va CoAP.")

        try:
            for command in commands:
                processes.append(subprocess.Popen(command))

            while True:
                for process in processes:
                    exit_code = process.poll()
                    if exit_code is not None:
                        raise CommandError(
                            f"Mot service da dung voi ma {exit_code}. Dang tat service con lai."
                        )
                time.sleep(0.4)
        except KeyboardInterrupt:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Dang tat Django va CoAP..."))
        finally:
            self._stop_processes(processes)

        self.stdout.write(self.style.SUCCESS("Da tat xong."))

    def _stop_processes(self, processes):
        for process in processes:
            if process.poll() is None:
                process.terminate()

        deadline = time.time() + 5
        for process in processes:
            while process.poll() is None and time.time() < deadline:
                time.sleep(0.1)

            if process.poll() is None:
                process.kill()
