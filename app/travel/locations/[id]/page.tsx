"use client";

import { use, useEffect } from "react";
import { Spin, Card, List, Button, Popconfirm, Tag, message } from "antd";
import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocations } from "../../hooks/use-locations";
import { useMoments } from "../../hooks/use-moments";
import { MomentForm } from "../../components/moment-form";
import { UploadImage } from "../../components/upload-image";
import type { Location } from "../../types";

export default function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locations, load, update, remove } = useLocations();
  const { moments, add: addMoment, remove: removeMoment } = useMoments(id);

  const location = locations.find((l) => l.id === id);

  useEffect(() => {
    load();
  }, [load]);

  if (!location) {
    return <Spin />;
  }

  async function handleDelete() {
    await remove(id);
    message.success("已删除");
    router.push("/travel/list");
  }

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.push("/travel/list")} style={{ marginBottom: 16 }}>
        返回列表
      </Button>

      <Card
        title={location.name}
        extra={
          <div style={{ display: "flex", gap: 8 }}>
            <Tag color={location.checked ? "green" : "blue"}>
              {location.checked ? "已去" : "待去"}
            </Tag>
            <Button size="small" onClick={() => update(id, { checked: !location.checked })}>
              {location.checked ? "标记为待去" : "标记为已去"}
            </Button>
            <UploadImage locationId={id} />
            <Popconfirm title="确认删除此位置？" onConfirm={handleDelete}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </div>
        }
      >
        <p><strong>地址：</strong>{location.address}</p>
        <p><strong>坐标：</strong>{location.longitude.toFixed(6)}, {location.latitude.toFixed(6)}</p>
        {location.comments && <p><strong>备注：</strong>{location.comments}</p>}
      </Card>

      <Card title="精彩瞬间" style={{ marginTop: 16 }}>
        <MomentForm onSubmit={addMoment} />
        <List
          style={{ marginTop: 16 }}
          dataSource={moments}
          renderItem={(moment) => (
            <List.Item
              actions={[
                <Popconfirm key="del" title="删除此瞬间？" onConfirm={() => removeMoment(moment.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={moment.date}
                description={moment.text}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
