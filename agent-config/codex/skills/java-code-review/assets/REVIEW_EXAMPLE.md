# 代码审查示例

以下示例展示三级优先级审查的完整输出方式：**先给问题，再说明风险，最后给出修正方向**。

---

## 审查结论

### 🔴 严查结论（注释 / 日志 / 测试）

- 问题：`ResumeServiceImpl` 缺少类级 Javadoc，未标注 `@author` 和 `@since`
  - 风险：维护者无法快速了解类的职责边界
  - 建议：补充 `/** ... @author xxx @since 2024/xx/xx */`

- 问题：`createResume` 方法日志使用字符串拼接：`log.info("id=" + id)`
  - 风险：日志级别关闭时仍有字符串构造开销
  - 建议：改为 `log.info("简历 - 创建 - 成功: id = {}", id)`

- 问题：`addAttachment` 写操作缺少方法入口「开始」日志
  - 风险：无法通过日志追踪写操作的触发时机和入参
  - 建议：在方法入口补充 `log.info("附件 - 添加 - 开始: resumeId = {}", resumeId)`

- 问题：`ResumeMapper` 类中有 `log.info("简历 - 查询 - 成功: id = {}", id)` 日志
  - 风险：DAO 层打业务日志，职责错误，Service 层重复打会产生重复日志
  - 建议：删除 Mapper 层日志，由 Service 层统一记录

- 已验证：编译通过、主查询流程
- 未验证：并发提交、批量导入
- 剩余风险：并发写场景可能存在重复简历，需结合唯一约束验证

---

> **第一级全部修复后，进入第二级。**

---

### 🟡 合规结论（分层 / 禁令 / 风格）

- 问题：`ResumeServiceImpl.createResume` 新增附件简历时只校验了 `resumeId` 是否为空，没有校验简历是否存在
  - 风险：会产生脏数据，后续查询详情时出现关联丢失
  - 建议：先查 `ResumeEntity` 是否存在，不存在时抛 `HireErrorCode.RESUME_NOT_FOUND.toEx()`

- 问题：`JobConfigController` 直接返回了 Service 层 DTO，未经过 Web 层 Convert
  - 风险：Web 契约与内部对象耦合，后续字段调整容易影响外部接口
  - 建议：补充 `JobConfigConvert`，Controller 统一返回 `Result<JobConfigVO>`

- 问题：`ResumeServiceImpl` 中使用了 `@Autowired` 注入依赖
  - 风险：不符合团队注入规范，Spring 建议 `@Resource` 用于字段注入
  - 建议：将所有 `@Autowired` 替换为 `@Resource`

---

> **第二级全部修复后，进入第三级。**

---

### 🟢 优化建议

- 问题：`JobCandidateCreateDTO` 同时承载创建和列表筛选字段
  - 风险：对象职责过重，校验规则相互污染，后续扩展容易相互影响
  - 建议：拆分 `JobCandidateCreateDTO` 与 `JobCandidateQueryDTO`

- 问题：`ResumeServiceImpl.buildResumeDetail` 超过 80 行，包含解析、组装、转换多个职责
  - 风险：难以单独测试，后续维护成本高
  - 建议：拆分为 `parseAttachment`、`buildEducation`、`buildExperience` 等私有方法

- 问题：Mapper XML 中列表查询未限制分页参数，全量返回
  - 风险：大表下存在慢查询和大结果集风险
  - 建议：统一走分页对象 `Page`，并限制单页大小

---

### 验证说明

- 已验证：字段映射、主查询流程、错误码复用
- 未验证：并发提交、批量导入
- 剩余风险：并发场景下可能存在重复写入，需要结合唯一约束或幂等方案继续验证
