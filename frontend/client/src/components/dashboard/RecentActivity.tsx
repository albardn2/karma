import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  CheckCircle, 
  UserPlus, 
  AlertTriangle,
  DollarSign
} from "lucide-react";
import type { ActivityItem } from "@/lib/types";

const mockActivity: ActivityItem[] = [
  {
    id: "1",
    type: "order_completed",
    description: "Order completed successfully",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    icon: "check"
  },
  {
    id: "2", 
    type: "customer_added",
    description: "New customer added to system",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    icon: "user-plus"
  },
  {
    id: "3",
    type: "invoice_overdue", 
    description: "Invoice payment overdue",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    icon: "alert"
  }
];

export function RecentActivity() {
  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'order_completed':
        return { icon: CheckCircle, color: 'bg-green-100 text-green-600' };
      case 'customer_added':
        return { icon: UserPlus, color: 'bg-blue-100 text-blue-600' };
      case 'invoice_overdue':
        return { icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-600' };
      case 'payment_received':
        return { icon: DollarSign, color: 'bg-green-100 text-green-600' };
      default:
        return { icon: CheckCircle, color: 'bg-gray-100 text-gray-600' };
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    return `${Math.floor(diffInHours / 24)} days ago`;
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {mockActivity.map((activity) => {
          const { icon: IconComponent, color } = getIcon(activity.type);
          
          return (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                <IconComponent className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{activity.description}</p>
                <p className="text-xs text-gray-500">{formatTimeAgo(activity.timestamp)}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
