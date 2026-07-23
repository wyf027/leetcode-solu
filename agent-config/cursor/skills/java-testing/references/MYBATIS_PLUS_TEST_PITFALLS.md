# MyBatis-Plus @Spy 测试陷阱（ServiceImpl 继承场景）

### 场景描述

当被测 Service 继承 `ServiceImpl<M, T>`（MyBatis-Plus），且测试类使用 `@Spy @InjectMocks` 时，
会遇到框架内部方法（`saveOrUpdate`、`lambdaQuery` 等）依赖真实 `baseMapper` 的注入问题。

**MyBatis-Plus 3.5.x 继承链**：`ServiceImpl` → `AbstractRepository` → `CrudRepository`

```
CrudRepository {
    private M baseMapper;  ← private 泛型字段

    protected M getBaseMapper() {
        Assert.notNull(baseMapper, "baseMapper can not be null");  // ← 崩溃点
        return baseMapper;
    }
}
```

**注入失败的两个原因**：

| 原因 | 说明 |
|------|------|
| 泛型擦除 | `private M baseMapper` 运行时擦除为 `Object`，Mockito 按类型匹配 `JobConfigMapper` 失败 |
| 字段名不符 | Mock 字段名（如 `jobConfigMapper`）≠ 目标字段名（`baseMapper`），按名匹配也失败 |

---

### 症状识别

```
MybatisPlusException: baseMapper can not be null
    at CrudRepository.getBaseMapper(CrudRepository.java:46)
    at AbstractRepository.saveOrUpdate(AbstractRepository.java:73)
    at XxxServiceImpl.someMethod(XxxServiceImpl.java:xxx)
```

或：

```
NullPointerException
    at LambdaQueryChainWrapper.<init>(...)
    at ServiceImpl.lambdaQuery(ServiceImpl.java:xxx)
    at XxxServiceImpl.someMethod(XxxServiceImpl.java:xxx)
```

---

### 修复模式：在 `@BeforeEach` 中全局 lenient stub

核心思路与 `lambdaQuery()` 完全一致：**在 spy 上直接 stub，完全绕过 MyBatis-Plus 内部实现**，
各测试方法可用 `doAnswer`/`doReturn` 按需覆盖 lenient 默认值。

**`saveOrUpdate` 修复**

```java
@ExtendWith(MockitoExtension.class)
class XxxServiceImplTest {

    @Spy
    @InjectMocks
    private XxxServiceImpl service;

    @Mock
    private XxxMapper xxxMapper;

    @BeforeEach
    void setUp() {
        // saveOrUpdate 在 MyBatis-Plus 3.5.x 中依赖真实 baseMapper（CrudRepository 中为 private 泛型字段），
        // @Spy + @InjectMocks 因泛型擦除与字段名不匹配（xxxMapper ≠ baseMapper）无法正确注入，
        // 全局 lenient stub 绕过内部实现；各用例可通过 doAnswer/doReturn 按需覆盖。
        lenient().doReturn(true).when(service).saveOrUpdate(any(XxxEntity.class));
    }

    /** 用例期望新增时注入雪花 ID（模拟 MetaFieldHandler），使用 doAnswer 覆盖默认 stub */
    private void stubSaveOrUpdate() {
        doAnswer(inv -> {
            XxxEntity e = inv.getArgument(0);
            if (e.getId() == null) { e.setId(ENTITY_ID); }
            return true;
        }).when(service).saveOrUpdate(any(XxxEntity.class));
    }

    /** 用例只关注"不调用"（verify never），不需要额外 stub，lenient 默认值即生效 */
    @Test
    void someMethod_noChanges_skipsDbWrite() {
        // ...准备数据...
        service.someMethod(dto);
        verify(service, never()).saveOrUpdate(any(XxxEntity.class));
    }
}
```

**`lambdaQuery` 修复**

```java
@SuppressWarnings("unchecked")
private LambdaQueryChainWrapper<XxxEntity> mockChain;

@BeforeEach
void setUp() {
    // lambdaQuery() 在 MyBatis-Plus 3.5.x 中依赖真实 mapper proxy（获取 entityClass），
    // 直接在 spy 上 stub 并返回 RETURNS_SELF 的 mock chain，完全绕过内部实现。
    mockChain = mock(LambdaQueryChainWrapper.class);
    doReturn(mockChain).when(service).lambdaQuery();
    // 显式 stub 链式 builder 方法（RETURNS_SELF 对 bridge method 无效）
    lenient().doReturn(mockChain).when(mockChain).eq(any(), any());
    lenient().doReturn(mockChain).when(mockChain).ne(any(), any());
    lenient().doReturn(mockChain).when(mockChain).last(any());
    lenient().doReturn(mockChain).when(mockChain).orderByDesc(any());
}

// 测试方法中只需 stub 终端方法（one / list / count 等）
@Test
void getById_exists_returnsEntity() {
    lenient().doReturn(entity).when(mockChain).one();
    // ...
}
```

---

### 规则汇总

| 问题场景 | 错误信息 | 修复位置 | 修复方式 |
|---------|---------|---------|---------|
| `saveOrUpdate` 被调用但 `baseMapper` 为 null | `baseMapper can not be null` | `@BeforeEach` | `lenient().doReturn(true).when(service).saveOrUpdate(any(...))` |
| `updateById` / `removeById` 被调用 | `baseMapper can not be null` | `@BeforeEach` | `lenient().doReturn(true).when(service).updateById(any(...))` |
| `lambdaQuery()` 获取 entityClass 失败 | `NullPointerException` | `@BeforeEach` | `doReturn(mockChain).when(service).lambdaQuery()` + 显式 stub builder 方法 |
| `getById` 被调用 | `baseMapper can not be null` | 测试方法内 | `doReturn(entity).when(service).getById(anyLong())` |
| Convert 中返回 `Map` 的方法触发虚假变更检测 | `verify(never()) failed`，新实体字段意外为 `{}` | `@BeforeEach` | `lenient().when(convert.jsonToFilePointMap(any())).thenReturn(null)`（见下方说明） |
| **私有方法直接 `baseMapper.selectList(...)`**（不走 ServiceImpl API） | `NullPointerException: this.baseMapper is null` | `@BeforeEach` | **`ReflectionTestUtils.setField(service, "baseMapper", xxxMapper)`**（见下方推荐范式） |
| **`removeById(Serializable)` 是 `IRepository` 的 default 方法**（spy 不生效） | `baseMapper can not be null` 自 `IRepository.removeById:62` | `@BeforeEach` | **`ReflectionTestUtils.setField(service, "baseMapper", xxxMapper)` + `lenient().when(xxxMapper.deleteById(any(Serializable.class))).thenReturn(1)`** |
| **`lambdaQuery().select(SFunction[])` varargs 重载未 stub** | `NullPointerException: select(...) returned null` | `@BeforeEach` | 同时 stub `select(SFunction[].class)` 和 `select((Predicate<TableFieldInfo>) any())` 两个重载 |
| **`argThat` lambda 在 stubbing 阶段被传 null** | `NullPointerException: dto.getXxx()` | 用例内 | 在 lambda 首行加 `dto != null &&` 守门 |

> **原则**：凡是 `ServiceImpl` 上继承来的、内部会调用 `getBaseMapper()` 的方法，
> 均需在 `@BeforeEach` 中提前 lenient stub，确保任何测试路径触发时不崩溃；
> 需要具体行为的用例在测试方法内用 `doAnswer`/`doReturn` 覆盖。

---

### 终极方案：ReflectionTestUtils 注入 baseMapper（推荐）

**适用场景**（满足任一）：
- ServiceImpl 内**私有方法直接访问 `baseMapper`**（如 `baseMapper.selectList(wrapper)`）
- 业务调用 `IRepository` 上 spy **无法可靠覆盖的 default 方法**（典型：`removeById(Serializable)`、部分 `getById` 重载）
- 全 spy 全部 ServiceImpl API 太啰嗦，宁可让真实方法走、只 mock 底层 mapper

**写法**：

```java
import org.springframework.test.util.ReflectionTestUtils;
import java.io.Serializable;

@ExtendWith(MockitoExtension.class)
class XxxServiceImplTest {

    @Spy
    @InjectMocks
    private XxxServiceImpl service;

    @Mock
    private XxxMapper xxxMapper;

    @BeforeEach
    void setUp() {
        // ── 关键：把 mock mapper 反射注入到 ServiceImpl.protected M baseMapper 字段；
        //    这样所有继承自 IRepository / IService 的 default 方法都能正常走，
        //    底层调用 baseMapper.deleteById / selectList / insert 时命中 mock。
        ReflectionTestUtils.setField(service, "baseMapper", xxxMapper);

        // 给底层 mapper 写操作配默认值（避免 NPE，按需在用例内覆盖）
        lenient().when(xxxMapper.deleteById(any(Serializable.class))).thenReturn(1);
        lenient().when(xxxMapper.insert(any(XxxEntity.class))).thenReturn(1);
        lenient().when(xxxMapper.updateById(any(XxxEntity.class))).thenReturn(1);

        // 仍保留 lambdaQuery / lambdaUpdate 的链式 stub（这两条不是 default 方法但需 mock 链）
        // ...（参考上文 lambdaQuery 修复）
    }

    @Test
    void deleteById_normal_invokesMapper() {
        service.removeById(123L);    // ← IRepository.removeById default 方法正常走
        verify(xxxMapper).deleteById(123L);
    }
}
```

**为什么需要 `Serializable` 类型的 `any()`？**

`BaseMapper.deleteById(Serializable id)` 接口签名是 `Serializable`，
若 stub 写成 `any(Long.class)` 或 `any()`，Mockito 在某些匹配链上会失效。
统一写 `any(Serializable.class)` 最安全。

**与 spy stub 全 ServiceImpl API 的取舍**：

| 维度 | spy stub 全 API | ReflectionTestUtils 注 baseMapper |
|---|---|---|
| 代码量 | 多（每个继承方法 1 行） | 少（1 行注入 + N 行 mapper stub） |
| 默认 method 支持 | 不可靠（Mockito 5 对 interface default 的 spy 行为不一致） | 完全支持（走真实 default 实现） |
| 测试 Service 自定义 lambdaQuery 链 | 必须 mock 链 | 仍需 mock 链（mapper 的 SQL 执行不可被本地 mock） |
| 适合场景 | 业务逻辑大量在 ServiceImpl 接口方法上 | 业务逻辑直接用 baseMapper 或依赖 default 方法 |

**实战经验**（hire 项目 ResumeServiceImplTest）：
原 `lenient().doReturn(true).when(service).removeById(any())` 看似在 stub spy 方法，
但实际 `IRepository.removeById(Serializable)` 是 interface default 方法，
spy 无法覆盖它对 `getBaseMapper()` 的调用 → 抛 `MybatisPlusException: baseMapper can not be null`。
改用 `ReflectionTestUtils.setField(service, "baseMapper", resumeMapper)` 直接修复。

---

### Mockito 4.x 特有陷阱：Map / Collection 返回类型默认不为 null

**Mockito 3.x 与 4.x 行为差异**：

| 返回类型 | Mockito 3.x 默认 | Mockito 4.x 默认 |
|---------|-----------------|-----------------|
| `String` / 对象 | `null` | `null` |
| `List` / `Set` | `null` | 空集合 `[]` |
| `Map` | `null` | 空 Map `{}` |

**问题场景**：Convert 接口中存在返回 `Map` 的方法（如 `jsonToFilePointMap`），
调用时传入 `null`，Mockito 4.x 返回空 `Map {}` 而非 `null`。
这会导致后续 `!= null` 判断为 true，进一步调用 `beanToJson({})` 得到 `"{}"`，
与存量实体的 `null` 字段比对时产生**虚假变更**，`hasEntityChanged` 错误返回 true。

**修复**：在 `@BeforeEach` 中显式 stub 所有返回 Map/Collection 的 Convert 方法：

```java
@BeforeEach
void setUp() {
    // Mockito 4.x 对 Map 返回类型默认返回空 Map（非 null），
    // 需显式 stub 为 null，还原"无 JSON 输入 → 无数据"的真实语义
    lenient().when(xxxConvert.jsonToFilePointMap(any())).thenReturn(null);
    lenient().when(xxxConvert.jsonToSomeMap(any())).thenReturn(null);
}
```
