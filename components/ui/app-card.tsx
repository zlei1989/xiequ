import { Card } from "antd";
import Link from "next/link";

export interface AppCardProps {
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
}

export function AppCard({ title, description, href, icon }: AppCardProps) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Card hoverable style={{ height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {icon && <div style={{ fontSize: 32 }}>{icon}</div>}
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          <p style={{ margin: 0, color: "#666" }}>{description}</p>
        </div>
      </Card>
    </Link>
  );
}
