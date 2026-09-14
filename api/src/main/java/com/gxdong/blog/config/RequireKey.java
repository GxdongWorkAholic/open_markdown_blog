package com.gxdong.blog.config;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标在需要访问密钥的 Controller 方法上。
 *
 * <p>用注解而不是「路径字符串白名单」：路径写错是静默失效的（漏保护一个端点不会报错），
 * 而漏写注解至少和别的方法一样显眼，且改动端点路径时注解跟着方法走。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireKey {
}
