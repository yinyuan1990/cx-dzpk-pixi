# -*- coding: utf-8 -*-
"""俱乐部改版冒烟:CLUB_UPDATE / 聚合待审(clubId=0) / MY_RECORDS clubId / ROOM_LIST players / CLUB_LIST myScore"""
import json, time, random, urllib.request

BASE = "http://127.0.0.1:9100"
WS = "ws://127.0.0.1:9100/ws/dzpk"

def http(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=10).read())

import struct, socket, base64, hashlib

class Sock:
    def __init__(self):
        self.s = socket.create_connection(("127.0.0.1", 9100), timeout=10)
        key = base64.b64encode(b"0123456789abcdef").decode()
        self.s.send((f"GET /ws/dzpk HTTP/1.1\r\nHost: 127.0.0.1:9100\r\nUpgrade: websocket\r\n"
                     f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        hdr = b""
        while b"\r\n\r\n" not in hdr:
            hdr += self.s.recv(1)
        self.buf = b""
        self.seq = 0

    def send(self, t, data, room=0):
        self.seq += 1
        payload = json.dumps({"type": t, "sequence": self.seq, "roomId": room, "data": data}).encode()
        n = len(payload)
        mask = bytes(random.randrange(256) for _ in range(4))
        if n < 126:
            frame = struct.pack("!BB", 0x81, 0x80 | n)
        elif n < 65536:
            frame = struct.pack("!BBH", 0x81, 0x80 | 126, n)
        else:
            frame = struct.pack("!BBQ", 0x81, 0x80 | 127, n)
        frame += mask + bytes(payload[i] ^ mask[i % 4] for i in range(n))
        self.s.send(frame)
        return self.seq

    def recv_msg(self, timeout=8):
        self.s.settimeout(timeout)
        while True:
            while len(self.buf) < 2:
                self.buf += self.s.recv(4096)
            b1, b2 = self.buf[0], self.buf[1]
            ln = b2 & 0x7F
            off = 2
            if ln == 126:
                while len(self.buf) < 4: self.buf += self.s.recv(4096)
                ln = struct.unpack("!H", self.buf[2:4])[0]; off = 4
            elif ln == 127:
                while len(self.buf) < 10: self.buf += self.s.recv(4096)
                ln = struct.unpack("!Q", self.buf[2:10])[0]; off = 10
            while len(self.buf) < off + ln:
                self.buf += self.s.recv(65536)
            payload = self.buf[off:off + ln]
            self.buf = self.buf[off + ln:]
            if (b1 & 0x0F) == 1:
                return json.loads(payload)

    def wait(self, t, timeout=8):
        end = time.time() + timeout
        while time.time() < end:
            m = self.recv_msg(max(0.5, end - time.time()))
            if m["type"] == t:
                return m
            if m["type"] == 499:
                raise AssertionError("ERROR: " + json.dumps(m.get("data"), ensure_ascii=False))
        raise AssertionError(f"等不到 {t}")

def new_account(nick):
    phone = "138" + str(random.randrange(10 ** 8)).zfill(8)
    r = http("/api/auth/register", {"phone": phone, "username": nick, "avatar": "/assets/a.png",
                                    "password": "abc123", "confirmPassword": "abc123", "registerDevice": 3})
    assert r.get("code") == 0, r
    r = http("/api/auth/login", {"phone": phone, "password": "abc123"})
    assert r.get("code") == 0, r
    return r["token"]

def ws_login(token):
    sk = Sock()
    sk.send(401, {"token": token})
    res = sk.wait(451)
    return sk, res["data"]

ok = 0
def check(name, cond, extra=""):
    global ok
    assert cond, f"FAIL {name} {extra}"
    ok += 1
    print("PASS", name, extra)

# ===== 账号 =====
tokA = new_account("群主甲")
tokB = new_account("申请乙")
a, infoA = ws_login(tokA)
b, infoB = ws_login(tokB)

# ===== A 创建俱乐部 =====
a.send(420, {"name": "夜战", "remark": "夜战德州俱乐部", "avatar": "http://x/a.jpg"})
club = a.wait(480)["data"]
clubId = club["clubId"]
check("创建俱乐部", clubId > 0, f"clubId={clubId} no={club['clubNo']}")

# ===== CLUB_UPDATE 改资料(433/493) =====
a.send(433, {"clubId": clubId, "name": "夜战2", "remark": "改过的简介", "avatar": "http://x/b.jpg", "notice": "今晚八点开局"})
upd = a.wait(493)["data"]
check("CLUB_UPDATE", upd["name"] == "夜战2" and upd["notice"] == "今晚八点开局")

# CLUB_LIST 应看到新资料 + myScore 字段
a.send(421, {})
clubs = a.wait(481)["data"]["clubs"]
c0 = [c for c in clubs if c["clubId"] == clubId][0]
check("CLUB_LIST 资料已更新", c0["name"] == "夜战2" and c0["notice"] == "今晚八点开局")
check("CLUB_LIST 带 myScore", "myScore" in c0, f"myScore={c0['myScore']}")

# 非管理员 B 改资料应被拒
b.send(422, {"code": club["clubNo"]})
b.wait(482)
b.send(433, {"clubId": clubId, "name": "黑", "remark": "x", "avatar": "http://x", "notice": ""})
try:
    b.wait(493, timeout=4)
    raise SystemExit("FAIL 非成员改资料未被拒绝")
except AssertionError as e:
    check("非管理员改资料被拒", "ERROR" in str(e) or "等不到" not in str(e), str(e)[:60])

# ===== 聚合待审(clubId=0)=====
a.send(423, {"clubId": 0})
reqs = a.wait(483)["data"]["requests"]
check("聚合待审含 clubName", len(reqs) == 1 and reqs[0].get("clubName") == "夜战2",
      json.dumps(reqs, ensure_ascii=False)[:120])

# B(非管理员)聚合待审应为空而非报错
b.send(423, {"clubId": 0})
reqsB = b.wait(483)["data"]["requests"]
check("非管理员聚合待审为空", reqsB == [])

# 审批同意
a.send(424, {"clubId": clubId, "requestId": reqs[0]["requestId"], "approve": True})
a.wait(484)
check("审批同意", True)

# ===== MY_RECORDS 带 clubId =====
a.send(411, {"limit": 10, "clubId": clubId})
rec = a.wait(471)["data"]
check("MY_RECORDS clubId 过滤", isinstance(rec["records"], list))
check("stats 含 winSessions", "winSessions" in (rec.get("stats") or {}), json.dumps(rec.get("stats")))

# ===== 建房 + ROOM_LIST players 快照 =====
a.send(403, {"clubId": clubId, "sb": 100, "maxPlayers": 6, "settleTimeMins": 30})
room = a.wait(453)["data"]
roomId = room["roomId"]
# 圈主周期扣钻需要群主有钻石:管理后台给 A 充 1000 钻
adm = http("/api/admin/login", {"password": "dz@admin2026"})
req = urllib.request.Request(BASE + "/api/admin/users/diamond",
                             data=json.dumps({"userId": infoA["userId"], "amount": 1000, "remark": "smoke"}).encode(),
                             headers={"Content-Type": "application/json", "X-Admin-Token": adm["token"]})
r = json.loads(urllib.request.urlopen(req, timeout=10).read())
assert r.get("code") == 0, r

# 群主/管理员不能参与本俱乐部游戏(对齐扯旋)→ 用成员 B:先增发+上分,再进房坐下
a.send(430, {"clubId": clubId, "op": "ownerAdd", "userId": 0, "amount": 50000})
a.wait(486)
a.send(430, {"clubId": clubId, "op": "distribute", "userId": infoB["userId"], "amount": 30000})
a.wait(486)
b.send(404, {}, roomId)
b.wait(454)
b.send(406, {"seat": 0, "buyin": 20000}, roomId)
b.wait(456)
time.sleep(0.5)
a.send(402, {"clubId": clubId})
rl = a.wait(452)["data"]["rooms"]
r0 = [r for r in rl if r["roomId"] == roomId][0]
check("ROOM_LIST 带 players", isinstance(r0.get("players"), list) and len(r0["players"]) >= 1,
      json.dumps(r0.get("players"), ensure_ascii=False)[:120])
check("ROOM_LIST 带 creatorUserId", r0.get("creatorUserId") == infoA["userId"])

print(f"\n=== 全部 {ok} 项通过 ===")
