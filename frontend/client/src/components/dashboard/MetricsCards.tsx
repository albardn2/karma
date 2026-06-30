import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  ClipboardList, 
  Users, 
  AlertTriangle 
} from "lucide-react";
import type { DashboardMetrics } from "@/lib/types";

interface MetricsCardsProps {
  metrics: DashboardMetrics;
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      label: "Total Revenue",
      value: `$${metrics.totalRevenue.toLocaleString()}`,
      change: "+12.5%",
      period: "vs last month",
      icon: DollarSign,
      changeType: "positive"
    },
    {
      label: "Active Orders",
      value: metrics.activeOrders.toString(),
      change: "8 pending",
      period: "fulfillment",
      icon: ClipboardList,
      changeType: "neutral"
    },
    {
      label: "Customers",
      value: metrics.totalCustomers.toString(),
      change: "+6 new",
      period: "this week",
      icon: Users,
      changeType: "positive"
    },
    {
      label: "Overdue Invoices",
      value: metrics.overdueInvoices.toString(),
      change: "$8,450",
      period: "total due",
      icon: AlertTriangle,
      changeType: "negative"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6">
      {cards.map((card, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                <div className="flex items-center mt-2">
                  <Badge 
                    variant="secondary"
                    className={`text-xs font-medium px-2 py-1 ${
                      card.changeType === 'positive' 
                        ? 'bg-green-100 text-green-600' 
                        : card.changeType === 'negative'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-blue-100 text-blue-600'
                    }`}
                  >
                    {card.change}
                  </Badge>
                  <span className="text-xs text-gray-500 ml-2">{card.period}</span>
                </div>
              </div>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                card.changeType === 'negative' ? 'bg-red-50' : 'bg-gradient-to-br from-[hsl(245,58%,57%)] to-[hsl(262,83%,67%)] bg-opacity-10'
              }`}>
                <card.icon className={`w-6 h-6 ${
                  card.changeType === 'negative' ? 'text-red-600' : 'text-[hsl(245,58%,57%)]'
                }`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
