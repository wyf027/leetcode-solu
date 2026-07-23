package com.succaiss.{service}.api.feign;

import com.succaiss.commons.base.dto.Result;
import com.succaiss.{service}.api.dto.XxxDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * Xxx 对外 API 接口（Feign 客户端）。
 *
 * <p><b>调用方接入步骤：</b>
 * <ol>
 *   <li>在消费方服务的启动类或配置类上添加：
 *       {@code @EnableFeignClients(basePackages = "com.succaiss.{service}.api.feign")}</li>
 *   <li>在需要调用的类中注入本接口：{@code @Resource private XxxApi xxxApi;}</li>
 * </ol>
 *
 * <p><b>注意事项：</b>
 * <ul>
 *   <li>URL 路径必须与 {@code XxxController} 的 {@code @RequestMapping} 路径完全一致，
 *       Controller 路径变更时本接口需同步更新</li>
 *   <li>{@code contextId} 全局唯一，同一服务存在多个 API 接口时必须各不相同，
 *       否则 Spring 启动时报 Bean 冲突</li>
 *   <li>出参统一为 {@link Result}{@code <T>}，消费方判断 {@code result.isSuccess()} 后再取数据</li>
 * </ul>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@FeignClient(name = "{service}-service", contextId = "xxxApi")
public interface XxxApi {

    /**
     * 根据主键 ID 查询详情。
     *
     * <p>记录不存在时返回失败结果（{@code result.isSuccess() == false}），不抛异常。
     *
     * @param id 主键 ID，不能为 null
     * @return 成功时 {@code data} 为详情对象；记录不存在时返回失败结果
     */
    @GetMapping("/xxx/{id}")
    Result<XxxDTO> getById(@PathVariable("id") Long id);

    /**
     * 创建新记录。
     *
     * @param dto 创建参数，必填字段已在 {@link XxxDTO} 中以 JSR-303 注解标注
     * @return 成功时 {@code data} 为新建记录的主键 ID
     */
    @PostMapping("/xxx")
    Result<Long> create(@RequestBody XxxDTO dto);
}
