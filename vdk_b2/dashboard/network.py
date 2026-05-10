import socket


def get_lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def resolve_bind_host(host):
    if host in ("auto", "0.0.0.0", ""):
        return get_lan_ip()

    return host
