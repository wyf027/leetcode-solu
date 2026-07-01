# ErrorCode 设计规范

**何时使用**：设计、编写、评审业务错误码时必读。

**适用范围**：5 个业务微服务 `system`、`platform`、`integration`、`hire`、`assess`。

## 一、编码格式

统一采用 7 位数字格式：`XXYYZZZ`

| 段位 | 位数 | 含义 | 说明 |
|------|------|------|------|
| `XX` | 2 | 服务编码 | 标识所属微服务，跨服务不可复用 |
| `YY` | 2 | 业务模块 | 标识服务内的业务域/子模块 |
| `ZZZ` | 3 | 具体错误 | 标识模块内的具体错误场景 |

示例：

- `1001001`：`system` 服务、`01` 用户模块、`001` 用户不存在
- `4001001`：`hire` 服务、`01` 职位配置模块、`001` 职位配置不存在

## 二、5 个微服务服务编码

| 服务 | XX 编码 | 示例前缀 | 说明 |
|------|----------|----------|------|
| `system` | `10` | `10YYZZZ` | 系统人资、用户、组织、学校等 |
| `platform` | `20` | `20YYZZZ` | 平台、站内信、邮件、附件、日志等 |
| `integration` | `30` | `30YYZZZ` | 第三方集成、外部接口对接 |
| `hire` | `40` | `40YYZZZ` | 招聘、职位、候选人、录用等 |
| `assess` | `50` | `50YYZZZ` | 评估、投递、面试、测评等 |

**【强制】** 新增 ErrorCode 时，必须先确认所属服务并使用上表既定 `XX` 编码，禁止跨服务占用。

## 三、模块编码规则

`YY` 表示服务内业务模块，建议按领域稳定分配，避免频繁变更。

推荐做法：

- 一个聚合根/主业务域对应一个 `YY`
- 同一模块下的新增错误持续递增 `ZZZ`
- 新模块优先复用未使用的 `YY`，不要挤占已有模块编号

示例：

| 服务 | 模块 | YY | 示例 |
|------|------|----|------|
| `system` | 用户 | `01` | `1001001` |
| `system` | 组织 | `02` | `1002001` |
| `hire` | 职位配置 | `01` | `4001001` |
| `hire` | 候选人 | `02` | `4002001` |

## 四、错误项编号规则

`ZZZ` 表示具体错误，建议在模块内从 `001` 开始顺序分配。

推荐约定：

- `001`~`099`：查询/不存在/状态非法等通用校验
- `100`~`199`：创建/修改/删除类错误
- `200`~`299`：流程推进、状态流转类错误
- `900`~`999`：保留给难归类但需兼容的历史错误

这不是强制分段，但同一项目内应保持一致。

## 五、命名与文案规范

枚举名约定：

- 服务级公共错误码：`SystemErrorCode`、`HireErrorCode`
- 领域级错误码：`UserErrorCode`、`JobConfigErrorCode`

枚举项命名约定：

- 使用大写英文 + 下划线
- 结构建议为 `资源/动作 + 状态/结果`
- 优先表达业务语义，而不是技术细节

正例：

- `USER_NOT_FOUND`
- `JOB_CONFIG_NOT_FOUND`
- `RESUME_STATUS_INVALID`

反例：

- `USER_ERROR`
- `SAVE_FAIL`
- `EXCEPTION_1`

错误描述约定：

- 面向业务语义，直接给出用户或调用方可理解的信息
- 不暴露 SQL、表名、堆栈、第三方原始异常等实现细节
- 同一模块文案风格保持一致

## 六、代码实现规范

**【强制】** 所有业务错误码必须实现 `common-base` 中的 `ErrorCode` 接口。

**【强制】** 禁止自定义平行协议：

- 禁止 `BizCode`
- 禁止 `BizException`
- 禁止散落的 `200/500`
- 禁止 `new RuntimeException("业务提示")`

标准实现方式：

```java
public enum UserErrorCode implements ErrorCode {

    USER_NOT_FOUND(1001001, "用户不存在"),
    USER_STATUS_INVALID(1001002, "用户状态无效"),
    ;

    private final Integer code;
    private final String desc;

    UserErrorCode(Integer code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    @Override
    public Integer code() {
        return code;
    }

    @Override
    public String desc() {
        return desc;
    }
}
```

## 七、使用规范

抛业务异常时：

```java
throw UserErrorCode.USER_NOT_FOUND.toEx();
```

返回统一失败结果时：

```java
return UserErrorCode.USER_NOT_FOUND.toResult();
```

禁止写法：

```java
throw new RuntimeException("用户不存在");
return Result.fail(500, "用户不存在");
```

## 八、落地检查清单

- [ ] 是否使用 `XXYYZZZ` 7 位编码
- [ ] `XX` 是否匹配 5 个微服务既定编码
- [ ] `YY` 是否与当前业务模块一致
- [ ] `ZZZ` 是否在模块内顺序分配且未冲突
- [ ] 是否实现 `ErrorCode` 接口
- [ ] 是否通过 `toEx()` / `toResult()` 使用
- [ ] 命名和描述是否表达清晰业务语义
- [ ] 是否避免泄漏底层实现细节
