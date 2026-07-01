# YApi Python 调用示例

## 基础工具函数

调用 YApi API 时，统一使用以下两个基础函数：

```python
import json, urllib.request

SERVER = "http://172.16.1.66:13000"

def yapi_get(path: str, params: dict) -> dict:
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{SERVER}{path}?{query}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))

def yapi_post(path: str, body: dict) -> dict:
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{SERVER}{path}", data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))
```

**错误判断**：`errcode == 0` 为成功，否则查看 `errmsg`。

---

## 常用操作示例

### 导入接口数据

```python
with open("yapi.json", "r", encoding="utf-8") as f:
    swagger_str = f.read()

result = yapi_post("/api/open/import_data", {
    "type": "swagger",
    "token": TOKEN,
    "merge": "mergeNoCheck",   # normal=只导新增 / good=合并response保留手工改动 / mergeNoCheck=完全覆盖（日常更新推荐）
    "json": swagger_str
})
assert result["errcode"] == 0, result["errmsg"]
```

### 运行自动化测试

```python
result = yapi_get("/api/open/run_auto_test", {
    "token": TOKEN,
    "id": PROJECT_ID       # 项目 ID
})
# result["data"]["passingPercent"] 为通过率
```

### 获取所有接口分类

```python
result = yapi_get("/api/interface/getCatMenu", {
    "project_id": PROJECT_ID,
    "token": TOKEN
})
cats = result["data"]   # list，每项含 _id / name
```

### 新增接口分类

```python
result = yapi_post("/api/interface/add_cat", {
    "project_id": PROJECT_ID,
    "name": "用户管理",
    "desc": "用户相关接口",
    "token": TOKEN
})
cat_id = result["data"]["_id"]
```

### 获取接口列表

```python
result = yapi_get("/api/interface/list", {
    "project_id": PROJECT_ID,
    "catid": CAT_ID,       # 分类 ID，可选
    "token": TOKEN,
    "page": 1,
    "limit": 20
})
interfaces = result["data"]["list"]
```

### 新增接口

```python
result = yapi_post("/api/interface/add", {
    "project_id": PROJECT_ID,
    "catid": CAT_ID,
    "title": "用户 - 详情查询",
    "path": "/user/{id}",
    "method": "GET",
    "token": TOKEN
})
interface_id = result["data"]["_id"]
```

### 获取接口详情

```python
result = yapi_get("/api/interface/get", {
    "id": INTERFACE_ID,
    "token": TOKEN
})
interface = result["data"]
```

### 更新接口

```python
result = yapi_post("/api/interface/up", {
    "id": INTERFACE_ID,
    "title": "用户 - 信息更新",
    "token": TOKEN
})
```
