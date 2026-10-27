from telegram.request import HTTPXRequest


def configure_transport(builder, proxy=None):
    normal = HTTPXRequest(proxy=proxy, connect_timeout=15.0, read_timeout=20.0)
    polling = HTTPXRequest(proxy=proxy, connect_timeout=15.0, read_timeout=20.0)
    return builder.request(normal).get_updates_request(polling)
