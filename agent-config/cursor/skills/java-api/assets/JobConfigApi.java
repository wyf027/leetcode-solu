package com.succaiss.hire.api.feign;

import com.succaiss.commons.base.dto.Result;
import com.succaiss.hire.api.dto.JobInfoDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * 职位配置对外 API 接口（Feign 客户端），供下游服务（如 assess）调用。
 *
 * <p><b>调用方接入步骤：</b>
 * <ol>
 *   <li>在消费方启动类或配置类添加：
 *       {@code @EnableFeignClients(basePackages = "com.succaiss.hire.api.feign")}</li>
 *   <li>在需要调用的类中注入：{@code @Resource private JobConfigApi jobConfigApi;}</li>
 * </ol>
 *
 * <p><b>注意事项：</b>
 * <ul>
 *   <li>URL 路径与 {@code JobConfigController} 的 {@code @RequestMapping("/job/config")} 保持同步</li>
 *   <li>{@code contextId = "jobConfigApi"} 全局唯一，同服务存在多个 Feign 客户端时互不冲突</li>
 * </ul>
 *
 * @author ${AUTHOR_NAME} and AI(${TOOL_NAME} - ${MODEL_NAME})
 * @since ${DATE}
 */
@FeignClient(name = "hire-service", contextId = "jobConfigApi")
public interface JobConfigApi {

    /**
     * 根据主键 ID 查询职位详情。
     *
     * <p>包含职位基本信息、候选人画像、业务补充及 AI 生成的 JD 内容。
     * 职位不存在时返回失败结果，消费方需判断 {@code result.isSuccess()} 后再使用数据。
     *
     * @param id 职位主键 ID，不能为 null
     * @return 成功时 {@code data} 为 {@link JobInfoDTO}；职位不存在时返回失败结果
     */
    @GetMapping("/job/config/{id}")
    Result<JobInfoDTO> getDetail(@PathVariable("id") Long id);
}
