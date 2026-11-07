import bridge


class AlertDialogBuilder:
    ALERT_TYPE_MESSAGE = 0
    ALERT_TYPE_LOADING = 3

    def __init__(self, *a, **k):
        raise bridge.Unsupported("AlertDialogBuilder: нативные диалоги Android недоступны на ПК")
