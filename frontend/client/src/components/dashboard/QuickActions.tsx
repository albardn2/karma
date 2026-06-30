import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { 
  UserPlus, 
  Plus, 
  FileText, 
  BarChart3 
} from "lucide-react";

export function QuickActions() {
  const [, setLocation] = useLocation();

  const actions = [
    {
      label: "Add New Customer",
      icon: UserPlus,
      action: () => setLocation("/customers"),
      variant: "default" as const
    },
    {
      label: "Create Order",
      icon: Plus,
      action: () => setLocation("/orders"),
      variant: "outline" as const
    },
    {
      label: "Generate Invoice",
      icon: FileText,
      action: () => setLocation("/invoices"),
      variant: "outline" as const
    },
    {
      label: "View Reports",
      icon: BarChart3,
      action: () => setLocation("/reports"),
      variant: "outline" as const
    }
  ];

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action, index) => (
          <Button
            key={index}
            onClick={action.action}
            variant={action.variant}
            className={`w-full justify-center ${
              action.variant === 'default' 
                ? 'brand-gradient hover:opacity-90 text-white' 
                : ''
            }`}
            size="lg"
          >
            <action.icon className="w-4 h-4 mr-2" />
            {action.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
