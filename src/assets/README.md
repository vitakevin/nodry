# 干土材质

- 文件：`dry-clay.webp`（1254×1254，659,752字节）。
- 使用内置imagegen生成；生成PNG转为WebP以减少安装包体积，未改变构图。
- 用于土块表面的颗粒与斑驳。动态裂缝、泥土侧壁、方向性边缘明暗仍由代码生成，不把照片中的固定裂缝冒充随分数变化。
- 应用运行时只读取内置文件，不调用图片生成服务或其他AI API。

## 最终生成提示词

```text
Use case: photorealistic-natural. Asset type: seamless ground material texture for a desktop application's dynamically cracking earth effect. Generate ONE square 1024x1024 photorealistic orthographic top-down close-up of an unbroken sun-dried clay soil surface from an arid African dry lake bed. Rich, tactile fine silt and tiny gritty particles, subtle natural mottling in dusty ochre, warm taupe and muted brown, microscopic pitting, extremely fine weathered flakes, variation across the surface. The surface is continuous and solid: NO large cracks, NO polygon divisions, NO drawn lines, NO stones, NO paving tiles, NO plants, NO horizon, NO footprints, NO text or watermark. Large fissures will be cut separately by application geometry. Flat even natural daylight with very subtle micro-relief shadows only, no global lighting gradient, no vignette, no directional cast shadow, no blur or depth of field, sharp natural mineral detail throughout. Edge-to-edge material map, seamlessly tileable, realistic photo / physically based material, never an illustration, never a smooth flat beige fill. Save the generated asset and report its local output path.
```
