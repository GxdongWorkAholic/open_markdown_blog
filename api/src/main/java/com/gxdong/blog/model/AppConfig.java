package com.gxdong.blog.model;

import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;

/**
 * 站点配置的整体形态，对应旧 Node 服务的 config.json。
 *
 * <p>{@code prefs} 与 {@code workspaces} 刻意都用 Jackson 的通用节点类型而不是强类型：
 * <ul>
 *   <li>prefs 是 11 个异质值（string / number / bool / string[]），强类型化会丢未知键、
 *       还可能改写数字的文本形式（0.5 → 5.0E-1），而对拍要的是逐字节一致。</li>
 *   <li>workspaces 的字段由前端定义（当前是 id/name/os/root/desc），服务端从校验收，
 *       强类型化会静默丢掉 desc 之类它不认识的字段。</li>
 * </ul>
 *
 * <p>字段声明顺序即 JSON 输出顺序，与旧服务的 {prefs, workspaces, activeWs, activePath} 保持一致。
 */
public class AppConfig {

    private ObjectNode prefs;
    private List<ObjectNode> workspaces = new ArrayList<>();
    private String activeWs;
    private String activePath;

    public ObjectNode getPrefs() { return prefs; }
    public void setPrefs(ObjectNode prefs) { this.prefs = prefs; }

    public List<ObjectNode> getWorkspaces() { return workspaces; }
    public void setWorkspaces(List<ObjectNode> workspaces) { this.workspaces = workspaces; }

    public String getActiveWs() { return activeWs; }
    public void setActiveWs(String activeWs) { this.activeWs = activeWs; }

    public String getActivePath() { return activePath; }
    public void setActivePath(String activePath) { this.activePath = activePath; }
}
