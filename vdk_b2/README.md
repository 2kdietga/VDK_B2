# VDK Gesture Dashboard

Dashboard Django nhận gesture từ ESP32 qua CoAP, điều khiển LED/Motor, mở menu, và chạy game web điều khiển bằng gesture hoặc nút bấm.

## Tổng quan

Dự án gồm 3 phần chính:

- **ESP32**: gửi gesture/nút bấm lên server bằng CoAP và chủ động polling lệnh LED/Motor bằng CoAP.
- **Django server**: phục vụ giao diện web, API trạng thái, lưu state runtime vào `gesture_state.json`.
- **CoAP bridge**: command `runcoap` nhận input CoAP từ ESP32 và cung cấp endpoint CoAP để ESP32 polling command khi ở mạng private/NAT.

## Công nghệ

- Python 3
- Django `>=5.2,<5.3`
- aiocoap `>=0.4.17`
- HTML/CSS/JavaScript thuần cho dashboard và game

## Cài đặt

```powershell
cd "E:\Thực hành môn học\VDK\VDK_gesture\vdk_b2"
.\venv\Scripts\activate
pip install -r requirements.txt
```

Nếu chưa có virtual environment:

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## Cấu hình ESP32

Sửa thông tin ESP32 trong `vdk_b2/settings.py`:

```python
ESP32_IP = "192.168.2.50"
ESP32_COMMAND_PORT = 5684
ESP32_COMMAND_PATH = "command"
ESP32_COMMAND_PUSH_ENABLED = False
ESP32_COMMAND_POLL_INTERVAL_MS = 150
ESP32_COMMAND_POLL_PATH = "command"
```

Ý nghĩa:

- `ESP32_COMMAND_PUSH_ENABLED`: `False` để ESP32 tự poll command từ server bằng CoAP. Đây là chế độ nên dùng khi server có IP public còn ESP32 nằm trong mạng private.
- `ESP32_COMMAND_POLL_INTERVAL_MS`: chu kỳ polling gợi ý cho ESP32, hiện là `150ms`.
- `ESP32_COMMAND_POLL_PATH`: path CoAP trên server để ESP32 polling command.
- `ESP32_IP`: chỉ cần dùng khi bật push CoAP chiều server -> ESP32.
- `ESP32_COMMAND_PORT`: port CoAP trên ESP32 để nhận lệnh LED/Motor nếu bật push.
- `ESP32_COMMAND_PATH`: path CoAP trên ESP32 để nhận command nếu bật push.

IP laptop không cần cấu hình cứng. Server tự lấy IP LAN hiện tại và in endpoint CoAP cần cấu hình cho ESP32 khi chạy.

## Chạy dự án

Chạy Django dashboard và CoAP server cùng lúc:

```powershell
python manage.py runall
```

Mặc định command này chạy:

- Django dashboard: `http://0.0.0.0:8000/`
- CoAP server nhận gesture: `coap://<IP_LAPTOP>:5683/gesture`
- CoAP command gửi về ESP32: `coap://<ESP32_IP>:5684/command`

Dừng cả Django và CoAP bằng `Ctrl+C`.

Có thể đổi host/port khi chạy:

```powershell
python manage.py runall --django-host 0.0.0.0 --django-port 8000 --coap-host auto --coap-port 5683 --coap-path gesture --coap-command-path command
```

Chỉ chạy Django:

```powershell
python manage.py runserver 0.0.0.0:8000
```

Chỉ chạy CoAP bridge:

```powershell
python manage.py runcoap --host auto --port 5683 --path gesture
```

## Kiến trúc thư mục

```text
vdk_b2/
├── manage.py
├── requirements.txt
├── gesture_state.json
├── vdk_b2/
│   ├── settings.py
│   └── urls.py
└── dashboard/
    ├── urls.py
    ├── views.py
    ├── state.py
    ├── network.py
    ├── management/commands/
    │   ├── runall.py
    │   └── runcoap.py
    ├── templates/dashboard/
    │   ├── index.html
    │   └── game.html
    └── static/dashboard/
        ├── dashboard.js
        ├── styles.css
        ├── game.js
        └── game.css
```

Vai trò file chính:

- `dashboard/state.py`: state machine trung tâm, chuẩn hóa gesture, xử lý menu, mode, game, LED/Motor.
- `dashboard/views.py`: render trang web và cung cấp API JSON.
- `dashboard/management/commands/runall.py`: chạy Django và CoAP bridge song song.
- `dashboard/management/commands/runcoap.py`: nhận gesture CoAP từ ESP32, có thể push command CoAP về ESP32 nếu bật `ESP32_COMMAND_PUSH_ENABLED`.
- `dashboard/network.py`: tự lấy IP LAN của laptop.
- `dashboard/static/dashboard/dashboard.js`: logic dashboard, polling state, điều khiển LED/Motor.
- `dashboard/static/dashboard/game.js`: game loop canvas, wave/enemy spawn, input, HUD, menu game.
- `gesture_state.json`: state runtime sinh tự động, không nên commit.

## Luồng dữ liệu

### 1. ESP32 gửi input lên laptop

ESP32 gửi CoAP `POST` hoặc `PUT` tới:

```text
coap://<IP_LAPTOP>:5683/gesture
```

Payload JSON khuyến nghị:

```json
{
  "state": "right",
  "btn_ok": false,
  "btn_menu": false
}
```

Server cũng hiểu các key gesture khác như `gesture`, `dir`, `direction`, hoặc `sequence`.

Gesture được chuẩn hóa:

| Input ESP32 | State nội bộ |
| --- | --- |
| `up` | `len` |
| `down` | `xuong` |
| `left` | `trai` |
| `right` | `phai` |
| `idle`, `stop` | `dung_yen` |

### 2. CoAP bridge cập nhật state

`runcoap.py` nhận payload, gọi:

```text
extract_device_input() -> set_device_input() -> _apply_device_input()
```

State được lưu vào `gesture_state.json`, gồm các trường chính:

- `gesture`: gesture hiện tại.
- `btn_menu`, `btn_ok`: trạng thái nút.
- `input_version`: tăng mỗi lần có input mới.
- `control_mode`: `gesture` hoặc `manual`.
- `active_control`: `led` hoặc `motor`.
- `led`, `motor`: giá trị 0-100.
- `menu_open`, `menu_index`: menu dashboard.
- `screen`: `dashboard` hoặc `game`.
- `esp32_last_seen`: thời điểm cuối ESP32 gửi input.

### 3. Web dashboard/game đọc state

Frontend polling API:

```text
GET /api/state/
```

Dashboard dùng state để:

- hiển thị gesture hiện tại;
- hiển thị IP/port server và ESP32;
- phát hiện ESP32 online/offline;
- mở menu;
- chọn LED hoặc Motor;
- cập nhật giá trị LED/Motor theo gesture hoặc slider.

Game dùng state để:

- đọc gesture liên tục;
- xử lý `btn_menu` để mở menu pause;
- xử lý `btn_ok` để tấn công hoặc chơi lại;
- quay về dashboard khi chọn menu tương ứng.

### 4. Dashboard cập nhật LED/Motor

Khi người dùng kéo slider hoặc gesture làm đổi LED/Motor, frontend gọi:

```text
POST /api/dashboard-state/
```

Payload ví dụ:

```json
{
  "active_control": "led",
  "control_mode": "manual",
  "led": 75,
  "motor": 40
}
```

Nếu `led` hoặc `motor` thay đổi, `command_version` tăng lên.

### 5. ESP32 polling command LED/Motor

Khi dashboard đổi `led` hoặc `motor`, server tăng `command_version`. Vì ESP32 thường nằm sau NAT/private IP, ESP32 nên chủ động hỏi server bằng CoAP mỗi `150ms`:

```text
GET coap://<PUBLIC_SERVER>:5683/command?last_version=<VERSION_ESP32_DANG_CO>
```

Nếu có command mới, server trả:

```json
{
  "changed": true,
  "command_version": 13,
  "poll_interval_ms": 150,
  "led": 75,
  "motor": 40
}
```

ESP32 áp dụng `led/motor`, lưu `command_version` mới, rồi poll tiếp sau khoảng `150ms`.

Nếu chưa có thay đổi, server trả gọn:

```json
{
  "changed": false,
  "command_version": 13,
  "poll_interval_ms": 150
}
```

Chiều push CoAP server -> ESP32 vẫn có thể bật lại bằng `ESP32_COMMAND_PUSH_ENABLED = True`, nhưng chỉ phù hợp khi server truy cập trực tiếp được IP/port của ESP32. Với public server/private ESP32, giữ polling CoAP là đúng hướng hơn.

## API

### `GET /api/state/`

Trả về toàn bộ state hiện tại, kèm thông tin runtime:

- `server_ip`
- `server_coap_port`
- `server_coap_path`
- `esp32_ip`
- `esp32_port`
- `esp32_online`

ESP32 được xem là online nếu có input trong vòng 10 giây gần nhất.

## CoAP endpoints cho ESP32

### `POST/PUT coap://<SERVER>:5683/gesture`

ESP32 gửi gesture/nút bấm lên server. Payload JSON khuyến nghị:

```json
{"state":"right","btn_ok":false,"btn_menu":false}
```

### `GET coap://<SERVER>:5683/command?last_version=<n>`

ESP32 polling lệnh LED/Motor. ESP32 gửi `last_version` là command version cuối cùng đã xử lý:

```text
GET coap://<SERVER>:5683/command?last_version=12
```

Nếu có lệnh mới, response có `changed: true`, `command_version`, `poll_interval_ms`, `led`, `motor`. Nếu không có lệnh mới, response có `changed: false`.

Payload response là JSON, ví dụ:

```json
{"changed":true,"command_version":13,"poll_interval_ms":150,"led":75,"motor":40}
```

### `POST /api/input/`

API giả lập input thiết bị từ web/keyboard.

Payload ví dụ:

```json
{"state":"left"}
```

```json
{"btn_menu":true}
```

```json
{"btn_ok":true}
```

### `POST /api/gesture/`

API nhận gesture dạng HTTP, hữu ích khi test không qua CoAP.

Payload có thể là JSON hoặc text:

```json
{"state":"right","btn_ok":false,"btn_menu":false}
```

### `POST /api/dashboard-state/`

Cập nhật trạng thái dashboard:

```json
{
  "active_control": "motor",
  "control_mode": "gesture",
  "led": 50,
  "motor": 80,
  "screen": "dashboard"
}
```

## Dashboard

Mở:

```text
http://127.0.0.1:8000/
```

Chức năng:

- xem trạng thái kết nối server/ESP32;
- xem gesture hiện tại;
- chuyển mode `Gesture` hoặc `Thủ công`;
- chọn điều khiển `LED` hoặc `Motor`;
- chỉnh LED/Motor bằng slider ở mode thủ công;
- chỉnh LED/Motor bằng gesture ở mode gesture;
- mở menu dashboard bằng `BTN_MENU`, phím `M`, hoặc nút web.

Điều khiển dashboard:

| Input | Chức năng |
| --- | --- |
| `up` / `len` | chọn LED hoặc đi lên trong menu |
| `down` / `xuong` | chọn Motor hoặc đi xuống trong menu |
| `left` / `trai` | giảm giá trị control đang chọn |
| `right` / `phai` | tăng giá trị control đang chọn |
| `btn_menu` | mở menu |
| `btn_ok` | chọn mục menu |

Menu dashboard:

- **Chế độ giải trí**: chuyển sang game.
- **Thay đổi mode**: đổi giữa `gesture` và `manual`.
- **Thoát menu**: đóng menu, quay lại dashboard.

## Game

Mở trực tiếp:

```text
http://127.0.0.1:8000/game/
```

Hoặc vào từ menu dashboard.

Game hiện tại là **Wave Shooter**: người chơi di chuyển trong màn hình, bắn/tấn công kẻ thù theo từng sóng, nhận thêm HP giữa các sóng và tính điểm theo loại kẻ thù.

Điều khiển game:

| Input | Chức năng |
| --- | --- |
| `left` / `trai` | di chuyển sang trái |
| `right` / `phai` | di chuyển sang phải |
| `up` / `len` | di chuyển lên |
| `down` / `xuong` | di chuyển xuống |
| `btn_ok` | tấn công, chơi lại khi thua |
| `btn_menu` | mở menu game |

Phím test trên laptop:

- `A`/`D` hoặc `ArrowLeft`/`ArrowRight`: trái/phải.
- `W`/`S` hoặc `ArrowUp`/`ArrowDown`: lên/xuống.
- `Space` hoặc `J`: tấn công.
- `R`: chơi lại.
- `M` hoặc `Escape`: menu.

Menu game:

- **Tiếp tục chơi**
- **Trở về dashboard**

## Test nhanh không cần ESP32

Gửi input bằng HTTP:

```powershell
curl -Method POST http://127.0.0.1:8000/api/input/ -ContentType "application/json" -Body '{"state":"right"}'
curl -Method POST http://127.0.0.1:8000/api/input/ -ContentType "application/json" -Body '{"btn_menu":true}'
curl -Method POST http://127.0.0.1:8000/api/input/ -ContentType "application/json" -Body '{"btn_ok":true}'
```

Đọc state:

```powershell
curl http://127.0.0.1:8000/api/state/
```

Test CoAP từ một client có hỗ trợ CoAP:

```text
POST coap://<IP_LAPTOP>:5683/gesture
{"state":"right","btn_ok":false,"btn_menu":false}
```

## Xử lý lỗi thường gặp

### ESP32 không online trên dashboard

- Kiểm tra ESP32 và laptop cùng mạng LAN.
- Kiểm tra ESP32 đang gửi tới đúng endpoint `coap://<IP_LAPTOP>:5683/gesture`.
- Kiểm tra firewall Windows có chặn UDP port `5683` không.
- Xem terminal chạy `runall` để biết server có nhận input hay không.

### ESP32 không nhận được LED/Motor mới

- Kiểm tra ESP32 có polling đúng endpoint CoAP public không: `coap://<PUBLIC_SERVER>:5683/command?last_version=<n>`.
- Kiểm tra ESP32 có cập nhật lại `last_version` sau khi nhận `changed: true` không.
- Kiểm tra dashboard có làm tăng `command_version` khi đổi LED/Motor không bằng `GET /api/state/`.
- Chu kỳ polling khuyến nghị là `150ms`; có thể đọc từ trường `poll_interval_ms`.

### Không gửi được command CoAP push về ESP32

- Chỉ cần mục này nếu bạn bật `ESP32_COMMAND_PUSH_ENABLED = True`.
- Kiểm tra `ESP32_IP` trong `vdk_b2/settings.py`.
- Kiểm tra ESP32 có mở CoAP server tại `ESP32_COMMAND_PORT` và `ESP32_COMMAND_PATH`.
- Lưu ý cấu hình hiện tại gửi về `coap://<ESP32_IP>:5684/command`.

### Port `5683` bị chiếm

```powershell
netstat -ano | findstr :5683
taskkill /PID <PID> /F
```

Hoặc đổi port:

```powershell
python manage.py runall --coap-port 5685
```

Khi đổi port, ESP32 cũng phải gửi gesture tới port mới.

### Port `8000` bị chiếm

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

Hoặc đổi port:

```powershell
python manage.py runall --django-port 8001
```

## Ghi chú phát triển

- `gesture_state.json`, `db.sqlite3`, `venv/`, `__pycache__/` đã được đưa vào `.gitignore`.
- Project hiện dùng file JSON làm state runtime thay vì database model.
- `db.sqlite3` không bắt buộc cho luồng dashboard/CoAP hiện tại, nhưng vẫn tồn tại vì đây là project Django.
- `test.py` là script UDP debug thô, không phải test tự động.
