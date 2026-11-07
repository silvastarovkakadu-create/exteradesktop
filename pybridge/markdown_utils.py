class _Parsed:
    def __init__(self, text):
        self.text = text
        self.entities = []


def parse_markdown(text):
    return _Parsed(text)
