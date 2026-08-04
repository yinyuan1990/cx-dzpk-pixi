# -*- coding: utf-8 -*-
"""我的页冒烟:update-profile(昵称/头像) / change-password"""
import json, random, urllib.request

BASE = "http://127.0.0.1:9100"

def http(path, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=10).read())

ok = 0
def check(name, cond, extra=""):
    global ok
    assert cond, f"FAIL {name} {extra}"
    ok += 1
    print("PASS", name, extra)

phone = "139" + str(random.randrange(10 ** 8)).zfill(8)
r = http("/api/auth/register", {"phone": phone, "username": "原名", "avatar": "http://x/a.jpg",
                                "password": "abc123", "confirmPassword": "abc123", "registerDevice": 3})
check("注册", r.get("code") == 0)
token = r["token"]

# 修改资料
r = http("/api/auth/update-profile", {"username": "新名字", "avatar": "http://x/b.jpg"}, token)
check("修改昵称头像", r.get("code") == 0 and r["nickname"] == "新名字" and r["avatar"] == "http://x/b.jpg", json.dumps(r, ensure_ascii=False)[:100])

# 无 token 拒绝
r = http("/api/auth/update-profile", {"username": "黑", "avatar": "http://x"})
check("无token被拒", r.get("code") == 1, r.get("msg"))

# 非法昵称拒绝
r = http("/api/auth/update-profile", {"username": "123456", "avatar": "http://x/b.jpg"}, token)
check("纯数字昵称被拒", r.get("code") == 1, r.get("msg"))

# 改密码:旧密码错
r = http("/api/auth/change-password", {"oldPassword": "wrong1", "newPassword": "xyz789", "confirmPassword": "xyz789"}, token)
check("旧密码错被拒", r.get("code") == 1, r.get("msg"))

# 改密码:成功
r = http("/api/auth/change-password", {"oldPassword": "abc123", "newPassword": "xyz789", "confirmPassword": "xyz789"}, token)
check("修改密码", r.get("code") == 0)

# 旧密码登录失败,新密码登录成功且资料是新值
r = http("/api/auth/login", {"phone": phone, "password": "abc123"})
check("旧密码登录失败", r.get("code") == 1, r.get("msg"))
r = http("/api/auth/login", {"phone": phone, "password": "xyz789"})
check("新密码登录成功", r.get("code") == 0 and r["nickname"] == "新名字" and r["avatar"] == "http://x/b.jpg")

print(f"\n=== 全部 {ok} 项通过 ===")
