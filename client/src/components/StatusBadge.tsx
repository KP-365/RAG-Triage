import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string; // 'Red', 'Amber', 'Green'
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, className, size = "md" }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  
  const colors = {
    red: "bg-red-100 text-red-700 border-red-200",
    amber: "bg-orange-100 text-orange-700 border-orange-200",
    green: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-sm",
    lg: "px-3 py-1 text-base",
  };

  const colorClass = colors[normalizedStatus as keyof typeof colors] || colors.pending;
  const sizeClass = sizes[size];

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border shadow-sm transition-colors",
        colorClass,
        sizeClass,
        className
      )}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full mr-1.5",
        normalizedStatus === 'red' && "bg-red-500",
        normalizedStatus === 'amber' && "bg-orange-500",
        normalizedStatus === 'green' && "bg-green-500",
        !['red', 'amber', 'green'].includes(normalizedStatus) && "bg-gray-400"
      )} />
      {status}
    </span>
  );
}
