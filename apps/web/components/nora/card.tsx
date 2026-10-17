import { cx } from "@/utils/cx";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-lg border border-line bg-white shadow-card", className)} {...props} />;
}
