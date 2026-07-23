# YApi API 完整参考

## 配置与认证

| 项 | 来源 |
|---|---|
| 服务地址 | 各业务工程根目录的 `yapi-import.json` 中的 `server` 字段（**不在 skill 内硬编码**） |
| Token | 同上的 `token` 字段（来自 YApi → 项目设置 → Token 配置） |
| GET 请求 | Token 作为 query 参数：`?token={token}` |
| POST 请求 | Token 放入 JSON body：`{"token": "..."}` |
| 错误判断 | 响应体 `errcode == 0` 为成功，否则查看 `errmsg` |

> Python 调用样例与基础工具函数见 [PYTHON_EXAMPLES.md](PYTHON_EXAMPLES.md)。

---

## API 速查表

| API 路径 | 方法 | 说明 |
|---|---|---|
| `/api/open/import_data` | POST | 导入接口数据（Swagger/OpenAPI） |
| `/api/open/run_auto_test` | GET | 运行自动化测试 |
| `/api/interface/add` | POST | 新增接口 |
| `/api/interface/save` | POST | 保存接口（覆盖） |
| `/api/interface/up` | POST | 更新接口 |
| `/api/interface/get` | GET | 获取单个接口详情 |
| `/api/interface/list` | GET | 获取接口列表 |
| `/api/interface/list_menu` | GET | 获取接口菜单（分类树） |
| `/api/interface/add_cat` | POST | 新增接口分类 |
| `/api/interface/getCatMenu` | GET | 获取所有分类 |

---

## /api/open/import_data — 导入接口数据

**方法**：POST  
**说明**：将 Swagger/OpenAPI JSON 批量导入指定项目，支持多种合并策略。

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 固定 `"swagger"` |
| `token` | string | ✅ | 项目 Token |
| `merge` | string | ✅ | 合并策略：`normal` / `good` / `mergeNoCheck` / `fullReplace` |
| `json` | string | ✅ | OpenAPI JSON 字符串 |

### 响应

```json
{ "errcode": 0, "errmsg": "成功！", "data": {} }
```

---

## /api/open/run_auto_test — 运行自动化测试

**方法**：GET  
**说明**：触发项目或测试用例集的自动化测试并返回结果。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `token` | string | ✅ | 项目 Token |
| `id` | integer | ✅ | 项目 ID 或测试集 ID |
| `mode` | string | ❌ | `"json"` 返回 JSON 格式（默认） |

### 响应

```json
{
  "errcode": 0,
  "data": {
    "total": 10,
    "passed": 9,
    "passingPercent": 90,
    "list": [...]
  }
}
```

---

## /api/interface/add — 新增接口

**方法**：POST  
**说明**：在指定分类下新增一个接口，返回新接口 ID。

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | integer | ✅ | 项目 ID |
| `catid` | integer | ✅ | 分类 ID |
| `title` | string | ✅ | 接口名称 |
| `path` | string | ✅ | 接口路径，如 `/user/{id}` |
| `method` | string | ✅ | HTTP 方法：`GET` / `POST` / `PUT` / `DELETE` / `PATCH` |
| `token` | string | ✅ | 项目 Token |
| `desc` | string | ❌ | 接口说明（Markdown） |
| `status` | string | ❌ | `"done"` / `"undone"`，默认 `"undone"` |
| `req_body_type` | string | ❌ | 请求体类型：`"json"` / `"form"` / `"file"` / `"raw"` |
| `req_body_other` | string | ❌ | 请求体 JSON Schema 字符串（`req_body_type=json` 时） |
| `res_body` | string | ❌ | 响应体 JSON Schema 字符串 |
| `res_body_type` | string | ❌ | 响应体类型：`"json"` / `"raw"` |

### 响应

```json
{
  "errcode": 0,
  "data": { "_id": 12345, "title": "获取用户详情", "path": "/user/{id}" }
}
```

---

## /api/interface/save — 保存接口

**方法**：POST  
**说明**：覆盖保存接口（含完整字段），等同于先查询再全量替换。已存在 `id` 时更新，不存在时新增。

### 请求 Body

字段与 `/api/interface/add` 相同，需额外传 `id`（接口 ID）来指定目标接口。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | ❌ | 接口 ID（传则更新，不传则新增） |
| （其余字段同 add） | | | |

### 响应

```json
{ "errcode": 0, "data": { "_id": 12345 } }
```

---

## /api/interface/up — 更新接口

**方法**：POST  
**说明**：部分更新接口字段，只传需要修改的字段，其余字段保持不变。

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | ✅ | 接口 ID |
| `token` | string | ✅ | 项目 Token |
| `title` | string | ❌ | 接口名称 |
| `path` | string | ❌ | 接口路径 |
| `method` | string | ❌ | HTTP 方法 |
| `status` | string | ❌ | `"done"` / `"undone"` |
| `desc` | string | ❌ | 接口说明（Markdown） |
| `req_body_other` | string | ❌ | 请求体 JSON Schema 字符串 |
| `res_body` | string | ❌ | 响应体 JSON Schema 字符串 |
| `catid` | integer | ❌ | 移动到新分类 |

### 响应

```json
{ "errcode": 0, "data": { "n": 1, "nModified": 1 } }
```

---

## /api/interface/get — 获取接口详情

**方法**：GET  
**说明**：根据接口 ID 查询单个接口的完整信息。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | ✅ | 接口 ID |
| `token` | string | ✅ | 项目 Token |

### 响应

```json
{
  "errcode": 0,
  "data": {
    "_id": 12345,
    "project_id": 1,
    "catid": 100,
    "title": "获取用户详情",
    "path": "/user/{id}",
    "method": "GET",
    "status": "done",
    "req_params": [...],
    "req_query": [...],
    "req_body_other": "...",
    "res_body": "...",
    "desc": "...",
    "uid": 1,
    "add_time": 1700000000,
    "up_time": 1700000000
  }
}
```

---

## /api/interface/list — 获取接口列表

**方法**：GET  
**说明**：分页获取指定项目/分类下的接口列表。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | integer | ✅ | 项目 ID |
| `token` | string | ✅ | 项目 Token |
| `catid` | integer | ❌ | 分类 ID（不传则返回全部分类的接口） |
| `page` | integer | ❌ | 页码，默认 `1` |
| `limit` | integer | ❌ | 每页条数，默认 `20` |

### 响应

```json
{
  "errcode": 0,
  "data": {
    "count": 42,
    "total": 42,
    "list": [
      { "_id": 12345, "title": "获取用户详情", "path": "/user/{id}", "method": "GET", "status": "done", "catid": 100 }
    ]
  }
}
```

---

## /api/interface/list_menu — 获取接口菜单（分类树）

**方法**：GET  
**说明**：以分类树结构返回项目内所有接口，每个分类节点包含其下接口列表，适合生成侧边栏导航。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | integer | ✅ | 项目 ID |
| `token` | string | ✅ | 项目 Token |

### 响应

```json
{
  "errcode": 0,
  "data": [
    {
      "_id": 100,
      "name": "用户管理",
      "list": [
        { "_id": 12345, "title": "获取用户详情", "path": "/user/{id}", "method": "GET" }
      ]
    }
  ]
}
```

> 与 `/api/interface/getCatMenu` 的区别：`list_menu` 的每个分类节点内含接口列表；`getCatMenu` 只返回分类节点本身，不含接口。

---

## /api/interface/add_cat — 新增接口分类

**方法**：POST  
**说明**：在项目下新增一个接口分类（即一级目录）。

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | integer | ✅ | 项目 ID |
| `name` | string | ✅ | 分类名称 |
| `token` | string | ✅ | 项目 Token |
| `desc` | string | ❌ | 分类描述 |

### 响应

```json
{
  "errcode": 0,
  "data": {
    "_id": 100,
    "name": "用户管理",
    "project_id": 1,
    "desc": "用户相关接口"
  }
}
```

---

## /api/interface/getCatMenu — 获取所有分类

**方法**：GET  
**说明**：返回项目内所有接口分类列表（不含分类下的接口）。常用于批量删除分类或获取分类 ID。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | integer | ✅ | 项目 ID |
| `token` | string | ✅ | 项目 Token |

### 响应

```json
{
  "errcode": 0,
  "data": [
    { "_id": 100, "name": "用户管理", "desc": "用户相关接口", "project_id": 1, "uid": 1, "add_time": 1700000000 },
    { "_id": 101, "name": "订单管理", "desc": "",              "project_id": 1, "uid": 1, "add_time": 1700000001 }
  ]
}
```

---

## 常用组合场景

### 场景：全量覆盖同步流程

```
1. getCatMenu        → 获取所有分类 _id
2. del_cat（逐一）   → 删除所有分类（接口随之删除）
3. import_data       → 以 normal 模式重新导入
```

### 场景：定向更新单个接口

```
1. list_menu / list  → 定位目标接口 _id
2. get               → 读取当前接口完整内容
3. up                → 只传需修改的字段
```

### 场景：批量查询接口状态

```
1. getCatMenu        → 获取所有分类 _id
2. list（循环）      → 按分类分页拉取全部接口
3. 统计 status=="undone" 的接口
```
