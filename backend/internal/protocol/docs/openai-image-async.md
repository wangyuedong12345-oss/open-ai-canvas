# OpenAI Images Async

OpenAI Images Async 插件适配 OpenAI Images 兼容但异步返回 `task_id` 的网关。创建请求仍发送到 `/v1/images/generations`，但响应不是最终图片，而是任务状态；宿主随后轮询 `/v1/tasks/{task_id}` 并下载返回的图片 URL。

## 接口与鉴权

{{OPERATIONS}}

```http
POST {channel_base_url}/v1/images/generations
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

```http
GET {channel_base_url}/v1/tasks/{task_id}
Authorization: Bearer <API_KEY>
```

该协议不声明图像编辑接口。需要蒙版或多图编辑时应继续使用明确支持编辑合同的同步 OpenAI Images 协议，或为对应网关新增独立编辑协议。

## 参数与字段映射

{{PARAMETERS}}

创建请求发送 `model`、`prompt`、`n`、`size`、`quality`。带参考图或编辑源图时，会把 `images` 转为 `image_urls`，每项优先使用公开 URL，缺失时使用 Data URL。协议还允许通过 `providerOptions.openai-image-async` 透传 `background`、`output_format`、`style` 和 `extra_body`。网关若不支持某个字段，应在模型能力配置里关闭或避免使用。

## 模型、尺寸与质量

模型名、尺寸枚举、质量档位和输出数量由具体网关决定。该协议不维护上游模型白名单；管理员应在渠道模型中设置真实的上游模型 ID，并在能力配置中只保留网关实际支持的 `size`、`quality` 和输出数量。

## 异步创建响应

```json
{
  "code": 200,
  "data": [
    {
      "status": "submitted",
      "task_id": "task_123"
    }
  ]
}
```

解析器会从 `id`、`task_id`、`taskId`、`request_id`、`data.id`、`data.task_id`、`data[0].id` 或 `data[0].task_id` 中提取任务 ID。`submitted`、`queued`、`pending` 会进入轮询。

## 轮询结果响应

```json
{
  "code": 200,
  "data": {
    "id": "task_123",
    "result": {
      "images": [
        {
          "url": [
            "https://cdn.example/generated.png"
          ]
        }
      ]
    },
    "status": "completed"
  }
}
```

成功状态支持 `succeeded`、`completed`、`done`、`success` 等常见值。图片地址可放在 `data.result.images`、`result.images`、`images`、`data`、`output`、`image_url`、`imageUrl`、`result_url` 或 `url` 等字段中；`url` 可以是字符串或字符串数组。宿主会把临时 URL 下载成画布结果。若轮询完成但没有图片地址，会返回明确错误。

## 兼容边界

该协议只覆盖“OpenAI Images 创建 + 任务轮询”的网关 profile。参考图按 `image_urls` JSON 字段发送，不走 OpenAI 官方 multipart `/v1/images/edits`。不同供应商若使用其他参考图字段、查询路径、需要 POST 查询或返回完全不同的结果结构，应新增独立协议插件，而不是根据模型名猜测。

## 官方资料

该协议面向 OpenAI Images 兼容网关的异步扩展，OpenAI 官方 Images API 本身以同步 `data[]` 图片结果为主。接入前应以网关自己的任务查询接口文档为准，并用管理端“测试模型”验证提交和轮询都可用。

{{CONTRACT}}
