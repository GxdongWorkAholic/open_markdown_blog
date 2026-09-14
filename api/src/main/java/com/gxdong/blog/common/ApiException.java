package com.gxdong.blog.common;

/** 带 HTTP 状态的业务异常。交给 GlobalExceptionHandler 翻成 {"error":"中文文案"}。 */
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(400, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(401, message);
    }

    public static ApiException serverError(String message) {
        return new ApiException(500, message);
    }
}
