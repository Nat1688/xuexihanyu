/** Source mappings are import defaults, not UI-hardcoded category navigation. */
export const INITIAL_FIELDS = [
  ['industry', 'Sản xuất và Công nghiệp', '生产与工业'],
  ['business', 'Kinh doanh và Thương mại', '商务与贸易'],
  ['finance', 'Kế toán và Tài chính', '会计与财务'],
  ['logistics', 'Xuất nhập khẩu và Logistics', '进出口与物流'],
  ['administration', 'Nhân sự và Hành chính', '人力资源与行政'],
  ['legal', 'Pháp lý và Hợp đồng', '法律与合同'],
] as const;
export const SOURCE_FIELDS: Record<string, readonly string[]> = {
  'Công xưởng May mặc': ['industry'],
  'Kế toán Kinh doanh': ['finance'],
  'Kế toán Nghiệp vụ': ['finance'],
  'Kế toán Nhập khẩu': ['finance', 'logistics'],
  'Kế toán Vận chuyển': ['finance', 'logistics'],
  'Nhân sự Công ty': ['administration'],
  'Thương mại Văn phòng': ['business'],
  'Thương mại Vận tải': ['business', 'logistics'],
  'Thương mại Xuất khẩu': ['business', 'logistics'],
  'Đàm phán Thương mại': ['business'],
  'Hải quan': ['logistics'],
  'Hợp đồng lao động – Từ vựng': ['legal'],
  'Hợp đồng lao động – Mẫu câu': ['legal'],
  'Công sở Văn phòng – Từ vựng': ['administration'],
  'Công sở Văn phòng – Mẫu câu': ['administration'],
};
