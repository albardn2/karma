from abc import ABC


class OperatorInterface(ABC):
    """
    Abstract base class for workflow operators.

    All workflow operators should inherit from this class and implement the required methods.
    """

    def execute(self, *args, **kwargs):
        """
        Execute the operator with the given arguments.

        :param args: Positional arguments for the operator.
        :param kwargs: Keyword arguments for the operator.
        :return: The result of the operator execution.
        """
        raise NotImplementedError("Subclasses must implement this method.")