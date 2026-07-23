# POM 模板

**何时使用**：新建微服务或新增模块时，对照本文复制对应 pom.xml 模板，将 `{service}` 替换为实际服务名（assess / hire / system / platform / integration）。

---

## 一、服务根 pom.xml（`{service}/pom.xml`）

作为服务聚合模块，声明子模块列表和服务内部依赖版本。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.succaiss</groupId>
        <artifactId>antview-parent</artifactId>
        <version>0.0.3-SNAPSHOT</version>
    </parent>

    <artifactId>{service}</artifactId>
    <packaging>pom</packaging>

    <name>{service}</name>
    <description>{Service} 微服务 - {业务说明}</description>

    <modules>
        <module>{service}-api</module>
        <module>{service}-service</module>
        <module>{service}-web</module>
    </modules>

    <dependencyManagement>
        <dependencies>
            <!-- 服务内部模块 -->
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>{service}-api</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>{service}-service</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>{service}-web</artifactId>
                <version>${project.version}</version>
            </dependency>

            <!-- 跨服务 API 依赖（按需保留） -->
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>system-api</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>platform-api</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>integration-api</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>hire-api</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>assess-api</artifactId>
                <version>${project.version}</version>
            </dependency>

            <!-- commons 公共组件 -->
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>common-base</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>common-spring</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>common-openfeign-starter</artifactId>
                <version>${project.version}</version>
            </dependency>
            <dependency>
                <groupId>com.succaiss</groupId>
                <artifactId>common-gateway-starter</artifactId>
                <version>${project.version}</version>
            </dependency>
        </dependencies>
    </dependencyManagement>

</project>
```

> **注意**：跨服务 API 按实际调用需要保留，不依赖的删掉，勿堆积无用声明。

---

## 二、api 模块 pom.xml（`{service}-api/pom.xml`）

只放对外契约（Feign 接口、DTO、枚举、ErrorCode），不含业务逻辑。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.succaiss</groupId>
        <artifactId>{service}</artifactId>
        <version>0.0.3-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>

    <artifactId>{service}-api</artifactId>
    <packaging>jar</packaging>

    <name>{service}-api</name>
    <description>{Service} API - 接口定义、DTO、契约，供外部或 Feign 调用</description>

    <dependencies>
        <!--
            common-openfeign-starter 传递提供：
              common-base、OpenFeign、Validation、Sentinel
            api 层仅需此一个依赖，禁止引入 common-spring / web 等重量级依赖
        -->
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>common-openfeign-starter</artifactId>
        </dependency>
    </dependencies>

</project>
```

---

## 三、service 模块 pom.xml（`{service}-service/pom.xml`）

承载核心业务逻辑、Entity、Mapper、事务。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.succaiss</groupId>
        <artifactId>{service}</artifactId>
        <version>0.0.3-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>

    <artifactId>{service}-service</artifactId>
    <packaging>jar</packaging>

    <name>{service}-service</name>
    <description>{Service} Service - 业务逻辑层，实现核心业务</description>

    <dependencies>
        <!-- 本服务 api -->
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>{service}-api</artifactId>
        </dependency>

        <!--
            common-spring 传递提供：
              common-base、Redis、MyBatis-Plus、PostgreSQL、Cache、MapStruct、RocketMQ
        -->
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>common-spring</artifactId>
        </dependency>

        <!-- 跨服务 API（按实际调用需要保留） -->
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>system-api</artifactId>
        </dependency>
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>platform-api</artifactId>
        </dependency>
        <!-- <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>integration-api</artifactId>
        </dependency> -->
        <!-- <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>hire-api</artifactId>
        </dependency> -->

        <!-- 测试：test scope 不传递，需显式声明 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

</project>
```

---

## 四、web 模块 pom.xml（`{service}-web/pom.xml`）

HTTP 接入层，唯一可打包成可执行 jar 的模块。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.succaiss</groupId>
        <artifactId>{service}</artifactId>
        <version>0.0.3-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>

    <artifactId>{service}-web</artifactId>
    <packaging>jar</packaging>

    <name>{service}-web</name>
    <description>{Service} Web - Web 接入层，Controller、配置、启动类</description>

    <dependencies>
        <!-- 本服务 service -->
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>{service}-service</artifactId>
        </dependency>

        <!--
            common-gateway-starter 传递提供：
              common-spring、Web、Security、OAuth2、Actuator、Nacos
        -->
        <dependency>
            <groupId>com.succaiss</groupId>
            <artifactId>common-gateway-starter</artifactId>
        </dependency>

        <!--
            Feign 按服务名负载均衡必需；
            缺少此依赖会报：No Feign Client for loadBalancing defined
        -->
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-loadbalancer</artifactId>
        </dependency>

        <!-- 测试 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- 生成可执行 Fat Jar，只在 web 模块配置 -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>

</project>
```

---

## 依赖传递速查

| starter | 传递提供的核心能力 |
|---------|------------------|
| `common-openfeign-starter` | common-base、OpenFeign、Validation、Sentinel |
| `common-spring` | common-base、Redis、MyBatis-Plus、PostgreSQL、Cache、MapStruct、RocketMQ |
| `common-gateway-starter` | common-spring（全量）、Web MVC、Security、OAuth2、Actuator、Nacos |

> **依赖方向**：`web → service → api`，禁止反向依赖。跨服务只依赖 `*-api`。
