# 演示：Markdown + ECharts 阅读器

> 用阅读器打开本文件即可看到各类图表自动渲染效果。右上角可导出 PDF / 图片 / Word。

## 1. 折线图（趋势）

```echarts
{
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["1月", "2月", "3月", "4月", "5月", "6月"] },
  "yAxis": { "type": "value" },
  "series": [
    { "name": "计划", "type": "line", "smooth": true, "data": [3, 5, 7, 9, 12, 15] },
    { "name": "实际", "type": "line", "smooth": true, "data": [2, 4, 8, 8, 14, 18] }
  ]
}
```

## 2. 柱状图（对比）

```echarts
{
  "tooltip": { "trigger": "axis" },
  "legend": {},
  "xAxis": { "type": "category", "data": ["甲", "乙", "丙", "丁"] },
  "yAxis": { "type": "value" },
  "series": [
    { "name": "2024", "type": "bar", "data": [42, 68, 55, 73] },
    { "name": "2025", "type": "bar", "data": [58, 71, 62, 88] }
  ]
}
```

## 3. 饼图（占比）

```echarts
{
  "tooltip": { "trigger": "item" },
  "legend": { "orient": "vertical", "left": "left" },
  "series": [
    { "name": "占比", "type": "pie", "radius": "60%",
      "data": [
        { "value": 40, "name": "A" },
        { "value": 25, "name": "B" },
        { "value": 20, "name": "C" },
        { "value": 15, "name": "D" }
      ] }
  ]
}
```

## 4. 普通 Markdown 内容

- 支持**加粗**、*斜体*、`行内代码`
- 支持表格：

| 项目 | 数值 |
|------|------|
| 示例 | 123 |

> 引用块示例。

结束。
