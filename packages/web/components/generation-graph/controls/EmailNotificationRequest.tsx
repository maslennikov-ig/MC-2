import React from 'react';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { toast } from "sonner";

export const EmailNotificationRequest = () => {

  const handleRequest = () => {
      // In real app, call API to subscribe
      toast.success("Notification Enabled", {
          description: "We will email you when the generation is complete.",
      });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleRequest} className="gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm" data-testid="email-notification-btn">
        <Bell className="w-4 h-4" />
        Notify me when done
    </Button>
  );
};
