import bridge


class BulletinHelper:
    @staticmethod
    def _show(text, *a, **k):
        bridge.emit("toast", text=str(text))

    show_info = show_success = show_error = show_simple = show_with_button = _show
    show_two_line = show_undo = show_copied_to_clipboard = _show
