# VDK Gesture Dashboard

Dashboard Django nhận gesture từ ESP32 qua CoAP, điều chỉnh LED/Motor, mở menu, và chạy game web điều khiển bằng gesture/nút.

## Cài đặt

```powershell
cd "E:\Thực hành môn học\VDK\VDK_gesture\vdk_b2"
.\venv\Scripts\activate
pip install -r requirements.txt
```

## Cấu hình

Trong `vdk_b2/settings.py`, sửa IP ESP32 theo Serial Monitor của ESP32:

```python
ESP32_IP = "192.168.2.50"
ESP32_COMMAND_PORT = 5683
ESP32_COMMAND_PATH = "command"
```

IP laptop/server không cần cấu hình cứng. Khi chạy, server tự lấy IP LAN hiện tại và in ra endpoint ESP32 cần gửi tới.

## Chạy

```powershell
python manage.py runall
```

Lệnh này chạy cùng lúc:

- Django dashboard: `http://0.0.0.0:8000/`
- CoAP server nhận gesture: `coap://<IP_LAPTOP>:5683/gesture`
- CoAP command gửi về ESP32: `coap://<ESP32_IP>:5683/command`

Dừng cả hai bằng `Ctrl+C`.

## Luồng dữ liệu

ESP32 gửi input lên server:

```text
ESP32 -> coap://<IP_LAPTOP>:5683/gesture
```

Payload ví dụ:

```json
{"state":"right","btn_ok":false,"btn_menu":false}
```

Server đổi thành state nội bộ:

- `right` -> `phai`
- `left` -> `trai`
- `up` -> `len`
- `down` -> `xuong`
- `idle` -> `dung_yen`

Dashboard/game đọc `/api/state/` để cập nhật giao diện.

Khi LED hoặc Motor thay đổi, server gửi về ESP32:

```text
server -> coap://<ESP32_IP>:5683/command
```

Payload:

```json
{"led":35,"motor":70}
```

## Dashboard

Trang chính:

```text
http://127.0.0.1:8000/
```

Chức năng:

- Chọn chế độ Gesture hoặc Thủ công
- Điều chỉnh LED/Motor
- Mở menu bằng nút Menu hoặc `BTN_MENU`
- Menu gồm:
  - Chế độ giải trí
  - Thay đổi mode
  - Thoát menu

## Game Web

Trang game:

```text
http://127.0.0.1:8000/game/
```

Điều khiển:

- `trai/phai`: di chuyển liên tục cho tới khi nhận `idle`
- `len`: nhảy
- `xuong`: cúi hoặc rơi nhanh
- `btn_ok`: chém, hoặc reset khi thua
- `btn_menu`: mở menu game

Menu game:

- Tiếp tục chơi
- Trở về dashboard

## File chính

- `dashboard/management/commands/runall.py`: chạy Django và CoAP cùng lúc
- `dashboard/management/commands/runcoap.py`: CoAP server nhận gesture và gửi command về ESP32
- `dashboard/state.py`: lưu state, xử lý gesture, menu, game, LED/Motor
- `dashboard/views.py`: API web
- `dashboard/static/dashboard/dashboard.js`: logic dashboard
- `dashboard/static/dashboard/game.js`: logic game web
- `gesture_state.json`: state runtime, không commit

## Kiểm tra lỗi port

Nếu gặp lỗi port `5683` bị chiếm:

```powershell
netstat -ano | findstr :5683
taskkill /PID <PID> /F
```

Nếu port `8000` bị chiếm:

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```
