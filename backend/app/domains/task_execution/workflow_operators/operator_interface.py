

class OperatorInterface:
    def execute(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement the execute method.")

    def validate(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement the validate method.")
    @property
    def name(self):
        raise NotImplementedError("Subclasses must implement the name property.")