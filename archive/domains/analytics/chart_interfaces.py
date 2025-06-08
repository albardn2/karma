from datetime import datetime

from pydantic import BaseModel, Field
from typing import List, Optional, Union

# Common base model for all charts
class ChartBase(BaseModel):
    title: str
    chart_type: str  # This field can be used as a discriminator in your front end

# Data model for a bar chart
class BarChartData(BaseModel):
    labels: List[Union[str, int, float, datetime]]
    values: List[float]
    background_colors: Optional[List[str]] = None
    border_colors: Optional[List[str]] = None

class BarChart(ChartBase):
    chart_type: str = "bar"
    data: BarChartData

# Data model for a line chart
class LineChartData(BaseModel):
    # labels list of strings, integers, or dates
    labels: List[Union[str, int, float, datetime]]
    values: List[float]
    line_color: Optional[str] = None
    fill: Optional[bool] = False

class LineChart(ChartBase):
    chart_type: str = "line"
    data: LineChartData

# Data model for a pie chart
class PieChartData(BaseModel):
    labels: List[Union[str, int, float, datetime]]
    values: List[float]
    colors: Optional[List[str]] = None

class PieChart(ChartBase):
    chart_type: str = "pie"
    data: PieChartData

# Data model for a simple number chart
class NumberChartData(BaseModel):
    value: float
    unit: Optional[str] = None  # e.g., %, $, etc.
    # You could add an optional description or formatting options if needed

class NumberChart(ChartBase):
    chart_type: str = "number"
    data: NumberChartData

# Union type that can be used if your endpoint returns multiple types of charts
Chart = Union[BarChart, LineChart, PieChart, NumberChart]
