import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Phone,
  Navigation,
  Share2,
  ExternalLink,
  MessageSquare,
  Building,
  User,
  DollarSign,
  MapPin,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { parseNotificationDeepLink } from "@/lib/notificationDeepLinks";
import { normalizeNotificationText } from "@/lib/notificationText";

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  category?: string;
  created_at: string;
  is_read?: boolean;
  target_url?: string;
  data?: Record<string, any>;
}

interface ReportDetailModalProps {
  notification: NotificationRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportDetailModal({
  notification,
  isOpen,
  onClose,
}: ReportDetailModalProps) {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!notification) return null;

  const target = parseNotificationDeepLink(notification.target_url);
  const displayedMessage = normalizeNotificationText(notification.message);

  // Helper to trigger WhatsApp Share
  const handleShareWhatsApp = () => {
    const text = `*${notification.title}*\n\n${displayedMessage}\n\n_Sent via Art N Glass CRM_`;
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  // Action: Navigate to exact deep link page
  const handleOpenPage = () => {
    onClose();
    if (notification.target_url) {
      navigate(target.fullUrl, { replace: true });
    }
  };

  // Helper for Category styling
  const getCategoryBadge = (cat?: string) => {
    switch (cat?.toLowerCase()) {
      case "critical":
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">🚨 Critical Exception</Badge>;
      case "important":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">⭐ Important Alert</Badge>;
      case "report":
        return <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30">📊 Executive Report</Badge>;
      case "reminder":
        return <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30">⏰ Schedule Reminder</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">🔔 System Notification</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800/80 p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            {getCategoryBadge(notification.category)}
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              {notification.created_at
                ? formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })
                : "Just now"}
            </span>
          </div>

          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2 pt-1">
            {notification.title}
          </DialogTitle>

          <DialogDescription className="text-xs text-slate-400">
            Interactive Report & Direct Decision Panel
          </DialogDescription>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Main Message Text Box */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-slate-200 leading-relaxed whitespace-pre-line">
              {displayedMessage}
            </p>
          </div>

          {/* Contextual Metric Cards */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">Target Path</span>
              <span className="font-mono text-indigo-400 font-semibold truncate pt-0.5">
                {target.path || "/"}
              </span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">Record Status</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1 pt-0.5">
                <CheckCircle2 className="h-3 w-3" /> Saved in App
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-900/90 border-t border-slate-800/80 p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* Direct WhatsApp Share */}
          <Button
            onClick={handleShareWhatsApp}
            variant="outline"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold text-xs h-10 rounded-xl flex items-center gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" /> Share WA
          </Button>

          {/* Deep Link Action */}
          <Button
            onClick={handleOpenPage}
            variant="default"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-10 rounded-xl flex items-center gap-1.5 sm:col-span-2 shadow-md shadow-indigo-600/20"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open Direct Record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
