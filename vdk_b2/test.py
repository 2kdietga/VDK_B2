import socket

# Khởi tạo socket UDP
UDP_IP = "0.0.0.0" # Lắng nghe trên mọi IP của máy
UDP_PORT = 5683

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))

print(f"Đang lắng nghe CoAP/UDP trên cổng {UDP_PORT}...")

while True:
    data, addr = sock.recvfrom(1024) # buffer size is 1024 bytes
    print(f"\n[+] Nhận gói tin từ: {addr}")
    # In ra chuỗi byte thô (sẽ thấy cả Header CoAP lẫn chuỗi JSON)
    print(f"Dữ liệu: {data}")
# Soạn
# Viết cho Vi Điều Khiển
