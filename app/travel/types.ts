// 位置
export type Location = {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  checked: boolean;
  comments: string;
  posterUrl?: string;
  deleted: boolean;
  createdTime: string;
};

// 精彩瞬间
export type Moment = {
  id: string;
  locationId: string;
  date: string;
  text: string;
  createdTime: string;
};

// 概览统计
export type Summary = {
  uncheckCount: number;
  uncheckPercentage: number;
  checkedCount: number;
  checkedPercentage: number;
  count: number;
};
