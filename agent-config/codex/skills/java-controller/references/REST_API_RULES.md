# 接口层规范（RESTful + JSON）

**何时使用**：设计、编写、评审 REST 接口时必读。

---

## 零、Controller 职责边界

Controller 是**协议适配层**，职责仅限于：

| 职责 | 说明 |
|------|------|
| 协议解析 | 解析 HTTP 请求（路径变量、Query 参数、请求体） |
| 入参校验触发 | 通过 `@Valid` 触发 JSR-303 校验，不写校验逻辑 |
| 调用 Service | 将解析后的 DTO 转交给 Service 层处理 |
| 响应封装 | 将 Service 返回的 DTO 转为 VO，用 `Result<T>` 包装后响应 |

**【强制】禁止在 Controller 中出现以下操作：**

```java
// ✗ 业务逻辑判断
if (dto.getStatus() == 1 && dto.getScore() > 60) { ... }

// ✗ 直接操作数据库（调 Mapper）
@Resource
private UserMapper userMapper;

// ✗ 数据拼装 / 聚合
List<UserVO> result = new ArrayList<>();
for (UserDTO u : userService.list()) {
    result.add(new UserVO(u.getId(), roleService.getByUserId(u.getId())));
}

// ✗ 手动 try-catch 吞异常或包装错误
try {
    userService.create(dto);
} catch (Exception e) {
    return Result.fail("创建失败");
}

// ✗ 事务控制
@Transactional
public Result<Long> create(@RequestBody UserDTO dto) { ... }

// ✗ 异步任务触发（应由 Service 负责）
executor.submit(() -> notifyService.send(id));

// ✗ 直接返回裸实体 / 裸集合
public UserEntity getById(@PathVariable Long id) { ... }
public List<User> list() { ... }
```

**【正例】标准 Controller 方法体只有 3 行以内：**

```java
@PostMapping
public Result<Long> create(@Valid @RequestBody UserCreateDTO dto) {
    return Result.ok(userService.create(dto));
}

@GetMapping("/{id}")
public Result<UserVO> getById(@PathVariable Long id) {
    return Result.ok(userConvert.toVO(userService.getById(id)));
}
```

---

## 一、URL 设计

### 资源命名

| 约定 | 说明 |
|------|------|
| 全小写 + 连字符 | URL 全部小写，多词用 `-` 分隔，禁止驼峰、下划线 |
| 名词复数 | 资源名使用名词复数，禁止动词 |
| 层级嵌套 | 子资源以父资源路径作前缀，最多 2 级嵌套 |
| 无版本路径 | 版本统一由网关/请求头承载，路径中不出现 `/v1/` |

```
# 正例
GET    /jobs
GET    /jobs/{jobId}
GET    /jobs/candidates/{jobId}
POST   /jobs/candidates/{jobId}
PATCH  /jobs/status/{jobId}
POST   /jobs/update/{jobId}
POST   /jobs/remove/{jobId}
DELETE /jobs/{jobId}

# 反例
GET   /getJob                        ← 含动词
GET   /job_list                      ← 下划线
GET   /Job/{JobId}                   ← 大写
GET   /v1/jobs                       ← 版本放路径
GET   /jobs/{jobId}/candidates       ← {id} 不在末尾（禁止）
PATCH /jobs/{jobId}/status           ← {id} 不在末尾（禁止）
POST  /jobs/{jobId}/update           ← {id} 不在末尾（禁止）
POST  /jobs/{jobId}/remove           ← {id} 不在末尾（禁止）
GET   /jobs/{jobId}/candidates/{candidateId}/offer-letters/{letterId}/attachments  ← 超 2 级
```

### @RequestMapping 路径规则

- 模块根路径使用**名词复数**：`@RequestMapping("/jobs")`
- 子资源嵌套在根路径下：`@GetMapping("/candidates/{jobId}")`
- **【强制】路径参数 `{id}` 必须放在路径末尾**，动作词或子资源名作前缀，禁止 `/{id}/sub-resource`、`/{id}/update`、`/{id}/status` 等将参数嵌入路径中间的写法
- 数据库表名 `_` 转 URL `/`：表 `job_candidate` → 路径 `/jobs/candidates/{jobId}`

```
# 正例：动作词在前，{id} 在末尾
POST   /jobs/update/{id}
POST   /jobs/remove/{id}
PATCH  /jobs/status/{id}
GET    /jobs/candidates/{jobId}

# 反例：{id} 在中间
POST   /jobs/{id}/update       ← 禁止
POST   /jobs/{id}/remove       ← 禁止
PATCH  /jobs/{id}/status       ← 禁止
GET    /jobs/{jobId}/candidates ← 禁止
```

---

## 二、HTTP Method 语义

| Method | 语义 | 幂等 | 请求体 |
|--------|------|------|--------|
| GET | 查询（单条/列表/分页） | 是 | 无 |
| POST | 新增 / 触发动作 | 否 | JSON Body |
| PUT | 全量更新 | 是 | JSON Body |
| PATCH | 部分更新（单字段/少量字段） | 是 | JSON Body |
| DELETE | 删除 | 是 | 无（ID 走路径） |

```java
// 正例
@GetMapping("/{id}")                              // 单条查询
@GetMapping                                       // 分页/列表
@PostMapping                                      // 新增
@PostMapping("/update/{id}")                      // 更新（{id} 在末尾）
@PostMapping("/remove/{id}")                      // 删除（{id} 在末尾）
@PatchMapping("/status/{id}")                     // 部分更新（状态变更，{id} 在末尾）
@DeleteMapping("/{id}")                           // 删除

// 反例
@PostMapping("/getById")                          // ← GET 语义走 POST
@GetMapping("/create")                            // ← 含动词且 GET 新增
@PatchMapping("/{id}/status")                     // ← {id} 不在末尾（禁止）
@PostMapping("/{id}/update")                      // ← {id} 不在末尾（禁止）
@PostMapping("/{id}/remove")                      // ← {id} 不在末尾（禁止）
```

---

## 三、入参规范

### 规则总览

| 场景 | 方式 | 注解 |
|------|------|------|
| 资源定位（单个） | 路径变量 | `@PathVariable` |
| 查询过滤 / 分页参数 | Query String | `@RequestParam` |
| 新增 / 更新 Body | JSON 请求体 | `@RequestBody` + `@Valid` |
| 文件上传 | Multipart | `@RequestPart` |

### GET 查询入参

- **分页/列表（常规，≤ 10 个过滤字段，无嵌套结构）**：使用 **无注解 DTO**（Model Attribute 绑定），Spring MVC 自动将 query string 字段映射到 DTO 属性，**禁止改用 POST**
- `current`（默认 1）、`size`（默认 10，最大 100）在 DTO 基类 `Pageable` 中声明，无需重复定义
- 禁止将 JSON 序列化对象放 Query String（禁止 `@RequestParam XxxQueryDTO dto`）
- 极端复杂查询（> 10 个字段或含嵌套 DTO）：允许例外，改用 `POST + @RequestBody QueryDTO`，注释说明原因

```java
// ✅ 正例：GET + Model Attribute（方法参数无任何注解）
@GetMapping
public Result<Paged<JobVO>> page(JobQueryDTO query) {
    return Result.ok(jobService.page(query));
}
// 调用：GET /jobs?current=1&size=10&title=Java&status=1

// ❌ 反例：常规分页改用 POST
@PostMapping("/page")
public Result<Paged<JobVO>> page(@RequestBody JobQueryDTO query) { ... }  // ← 禁止

// ❌ 反例：@RequestParam 注解在 DTO 上
@GetMapping
public Result<Paged<JobVO>> page(@RequestParam JobQueryDTO dto) { ... }  // ← 禁止
```

### POST / PUT / PATCH 入参

- Body 统一 **JSON 格式**，Content-Type: `application/json`
- 必须加 `@RequestBody` + `@Valid`
- 字段校验使用 JSR-303 注解（`@NotNull`、`@NotBlank`、`@Size`、`@Min` 等）
- PATCH 仅传需更新的字段，对应 DTO 字段设为 `required = false`（可用 `@Nullable` + `@Valid`）

```java
// 正例：新增
@PostMapping
public Result<Long> create(@Valid @RequestBody JobCreateDTO dto) {
    return Result.ok(jobService.create(dto));
}

// 正例：PATCH 部分更新（如更新薪资区间），@PathVariable 放最前
@PatchMapping("/salary/{id}")
public Result<Void> updateSalary(@PathVariable Long id,
                                  @Valid @RequestBody JobSalaryUpdateDTO dto) {
    jobService.updateSalary(id, dto);
    return Result.ok();
}

// 反例：Body 用 Map
@PostMapping
public Result<Long> create(@RequestBody Map<String, Object> params) { ... }  // ← 禁止

// 反例：表单提交
@PostMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
public Result<Long> create(@RequestParam String title) { ... }  // ← 接口层禁止，除文件上传场景

// 反例：@PathVariable 放在 @RequestBody 后面
@PatchMapping("/status/{id}")
public Result<Void> updateStatus(@Valid @RequestBody JobStatusUpdateDTO dto,
                                  @PathVariable Long id) { ... }  // ← 禁止
```

### 方法参数顺序

**【强制】** 当方法同时有多种参数注解时，按以下顺序排列，`@PathVariable` 必须放最前：

```
@PathVariable  →  @RequestBody / @Valid @RequestBody  →  @RequestParam
```

```java
// 正例
public Result<Void> updateStatus(@PathVariable Long id,
                                  @Valid @RequestBody JobStatusUpdateDTO dto) { ... }

// 反例
public Result<Void> updateStatus(@Valid @RequestBody JobStatusUpdateDTO dto,
                                  @PathVariable Long id) { ... }  // ← 禁止
```

### 批量操作入参

- 批量操作用 POST，路径加 `/batch` 动作词后缀，Body 传 ID 列表或批量 DTO
- ID 列表限制 size（通常 ≤ 100），超出抛 BusinessException

```java
// 正例
@PostMapping("/batch-status")
public Result<Void> batchUpdateStatus(@Valid @RequestBody JobCandidateStatusBatchUpdateDTO dto) {
    jobCandidateService.batchUpdateStatus(dto);
    return Result.ok();
}
```

---

## 四、出参规范

### 统一 Result 封装

所有接口返回值必须用项目 `Result<T>` 包装，禁止裸返回实体或基本类型。

```json
// 成功（有数据）
{
  "code": 0,
  "message": "success",
  "data": { ... }
}

// 成功（无数据）
{
  "code": 0,
  "message": "success",
  "data": null
}

// 失败
{
  "code": 10001,
  "message": "职位不存在",
  "data": null
}
```

```java
// 正例
Result<JobVO>         getById(...)       // 单条
Result<Paged<JobVO>>   list(...)          // 分页
Result<Long>          create(...)        // 新增返回 ID
Result<Void>          update(...)        // 更新/删除无数据
Result<List<JobVO>>   listAll(...)       // 非分页列表

// 反例
JobVO      getById(...)                  // ← 裸实体
List<Job>  list(...)                     // ← 裸集合
Map<...>   getData(...)                  // ← Map 出参
```

### 分页出参

统一使用 `Paged<T>`，结构如下：

```json
{
  "code": 0,
  "data": {
    "list": [ ... ],
    "total": 100,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

### VO 字段约定

| 约定 | 说明 |
|------|------|
| 仅含展示字段 | 不暴露 DB 内部字段（如 `deleted`、`version`、`updateTime` 除非需要） |
| 枚举序列化 | 返回 code + desc 两个字段，如 `statusCode: 1`、`statusDesc: "已发布"` |
| 日期格式 | 统一 `yyyy-MM-dd HH:mm:ss`，使用 `@JsonFormat` |
| Long 序列化 | Long/long 转 String 防前端精度丢失，加 `@JsonSerialize(using = ToStringSerializer.class)` |

```java
// 正例
@Data
public class JobVO {
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    private String title;

    /** 状态码，见 {@link JobStatusEnum} */
    private Integer statusCode;
    private String statusDesc;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private LocalDateTime createTime;
}
```

---

## 五、HTTP 状态码约定

| 状态码 | 场景 |
|--------|------|
| 200 | 所有业务请求统一返回 200，业务成功/失败通过 `Result.code` 区分 |
| 400 | 参数校验失败（由全局 ControllerAdvice 处理 MethodArgumentNotValidException） |
| 401 | 未认证（由网关/安全框架处理） |
| 403 | 无权限 |
| 404 | 路由不存在（非业务 404，业务资源不存在用 Result 错误码表达） |
| 500 | 系统异常（未捕获异常，由全局 ControllerAdvice 兜底） |

> 业务层禁止手动 `response.setStatus(xxx)`，HTTP 状态码由框架和全局异常处理器维护。

---

## 六、全局异常处理

- Controller 层**禁止** try-catch，统一由 `@RestControllerAdvice` 处理
- 业务异常抛 `BusinessException`，携带 `ErrorCode`
- 框架异常（参数校验、类型转换）由 ControllerAdvice 统一转 `Result.fail()`

```java
// 正例：Controller 不捕获异常
@DeleteMapping("/{id}")
public Result<Void> remove(@PathVariable Long id) {
    jobService.remove(id);   // service 内部抛 BusinessException
    return Result.ok();
}

// 反例：Controller 捕获异常
@DeleteMapping("/{id}")
public Result<Void> remove(@PathVariable Long id) {
    try {
        jobService.remove(id);
        return Result.ok();
    } catch (Exception e) {
        return Result.fail("删除失败");  // ← 禁止
    }
}
```

---

## 七、Content-Type 约定

| 场景 | Content-Type |
|------|------|
| 所有 JSON 接口（GET 响应 / POST·PUT·PATCH 请求+响应） | `application/json; charset=UTF-8` |
| 文件上传 | `multipart/form-data` |
| 文件下载 | `application/octet-stream` 或对应 MIME 类型 |

- `@RestController` 已默认 `produces = application/json`，无需手动声明
- 禁止 `application/x-www-form-urlencoded` 用于业务接口

---

## 八、命名一致性

Controller 方法名与 HTTP Method + 资源保持语义一致：

| 场景 | 方法名 |
|------|--------|
| GET 单条 | `getById` / `detail` |
| GET 列表/分页 | `list` / `page` |
| POST 新增 | `create` |
| PUT 全量更新 | `update` |
| PATCH 部分更新 | `update{Field}` / `changeStatus` |
| DELETE 删除 | `remove` / `delete` |
| POST 批量操作 | `batchCreate` / `batchUpdateStatus` |

---

## 九、审查清单

- [ ] **职责**：无业务逻辑、无 Mapper 调用、无数据拼装聚合、无 try-catch、无 @Transactional、无异步任务触发；方法体 ≤ 3 行
- [ ] URL：小写 + 连字符，名词复数，无动词，≤ 2 级嵌套，`{id}` 在路径末尾
- [ ] Method：GET 查/POST 增/PUT 全量更新/PATCH 部分/DELETE 删
- [ ] 入参：GET 分页/列表用**无注解 DTO**（Model Attribute），Body 用 `@RequestBody @Valid`，禁止 Map/Form 入参，禁止常规分页改用 POST；参数顺序：`@PathVariable → @RequestBody → @RequestParam`
- [ ] 出参：统一 `Result<T>` 封装，分页用 `Paged<T>`，无裸实体/裸集合
- [ ] VO：Long → String，枚举拆 code+desc，日期加 `@JsonFormat`
- [ ] 异常：Controller 无 try-catch，业务异常抛 `BusinessException + ErrorCode`
- [ ] Content-Type：业务接口统一 `application/json`
- [ ] YApi：工程根目录存在 `yapi-import.json`；Controller 类和方法均有 Javadoc（禁止 `@Tag`/`@Operation`）；接口变更后 AI 生成 `yapi.json` 并执行同步脚本，详见 [YAPI_SYNC](YAPI_SYNC.md)

---

## 十、YApi 同步

接口设计完成或变更后，需同步维护工程根目录下的 `yapi-import.json`，将接口文档同步到 YApi 服务器。

**格式规范与同步命令详见** [YAPI_SYNC](YAPI_SYNC.md)。

### 快速规则

- **禁止引入 springdoc / springfox**，`yapi.json` 由 AI 分析 Controller 源码静态生成
- 工程根目录放 `yapi-import.json`（type=swagger、token 各服务独立、server 统一）和 `yapi.json`
- Controller 变更后让 AI 重新生成 `yapi.json`，再执行同步脚本
- 同步脚本由 java-toolkit skill 统一提供（`{skills}/java-toolkit/scripts/sync-yapi.sh`），读取项目 `yapi-import.json` 配置后调用 YApi `POST /api/open/import_data` 导入，**禁止将脚本复制到业务工程**

```bash
# 同步示例（传入业务工程根目录）
bash ~/cursor/skills/java-toolkit/scripts/sync-yapi.sh ~/IdeaProjects/hire
```
