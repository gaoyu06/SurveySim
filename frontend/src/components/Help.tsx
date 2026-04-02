import { InfoCircleOutlined } from "@ant-design/icons";
import { Space, Tooltip, Typography } from "antd";
import type { ReactNode } from "react";

export function FieldLabel({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <Space size={6} align="center" className="field-label">
      <span>{label}</span>
      {hint ? (
        <Tooltip title={hint}>
          <InfoCircleOutlined className="field-label__icon" />
        </Tooltip>
      ) : null}
    </Space>
  );
}

export function HelpCallout({
  title,
  description,
  items,
}: {
  title: ReactNode;
  description?: ReactNode;
  items?: ReactNode[];
}) {
  return (
    <div className="help-callout">
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space size={8} align="start" className="help-callout__title-row">
          <InfoCircleOutlined className="help-callout__icon" />
          <div style={{ minWidth: 0 }}>
            <Typography.Title level={5} className="help-callout__title">
              {title}
            </Typography.Title>
            {description ? (
              <Typography.Paragraph className="help-callout__description">
                {description}
              </Typography.Paragraph>
            ) : null}
          </div>
        </Space>
        {items?.length ? (
          <div className="help-callout__list">
            {items.map((item, index) => (
              <div key={index} className="help-callout__item">
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </Space>
    </div>
  );
}
