# Salesforce JWT Bearer Token フロー

## 概要

パスワード不要でサーバー間認証を行うOAuthフロー。  
秘密鍵で署名したJWTをSalesforceに送り、access_tokenを取得する。

## 必要なもの

| 項目 | 説明 |
|------|------|
| `key.pem` | 秘密鍵（署名に使用。外部に出さない） |
| `server.crt` | 公開鍵証明書（Salesforceに登録済み） |
| Consumer Key | Connected AppのClient ID |
| username | 実行ユーザーのSalesforceアカウント |

## フロー図

```
あなたのサーバー                    Salesforce
      │                                │
      │  1. JWTを秘密鍵で署名           │
      │                                │
      │  2. JWT送信 ─────────────────► │
      │                                │  3. 公開鍵(.crt)で署名を検証
      │  4. access_token ◄──────────── │
      │                                │
      │  5. APIリクエスト ────────────► │
      │  6. データ ◄─────────────────── │
```

## JWTの構造

```
ヘッダー.ペイロード.署名
```

### ヘッダー
```json
{
  "alg": "RS256",
  "typ": "JWT"
}
```

### ペイロード
```json
{
  "iss": "Consumer Key（発行者）",
  "sub": "username@example.com（実行ユーザー）",
  "aud": "https://login.salesforce.com",
  "exp": 1234567890
}
```

### 署名
```
RSA256(base64(ヘッダー) + "." + base64(ペイロード), 秘密鍵)
```

`exp` は発行時刻 + 300秒（5分）。それ以降は無効。

## Salesforce側の設定

### Connected App
- OAuth設定を有効化
- `.crt` ファイルを登録（デジタル署名を使用）
- 許可されているユーザー: `管理者が承認したユーザーは事前承認済み`
- 対象ユーザーのプロファイルを追加

## Pythonサンプルコード

```python
import jwt
import time
import requests

CONSUMER_KEY = "your_consumer_key"
USERNAME     = "user@example.com"
LOGIN_URL    = "https://login.salesforce.com"

def get_access_token():
    private_key = open("key.pem").read()

    payload = {
        "iss": CONSUMER_KEY,
        "sub": USERNAME,
        "aud": LOGIN_URL,
        "exp": int(time.time()) + 300
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")

    res = requests.post(f"{LOGIN_URL}/services/oauth2/token", data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": token
    })
    res.raise_for_status()
    return res.json()

def call_api(access_token, instance_url, path):
    res = requests.get(
        f"{instance_url}{path}",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    res.raise_for_status()
    return res.json()


# 実行例
data = get_access_token()
access_token = data["access_token"]
instance_url = data["instance_url"]

result = call_api(access_token, instance_url, "/services/data/v59.0/sobjects/")
print(f"オブジェクト数: {len(result['sobjects'])}")
```

## curlサンプル

### 1. JWTを生成してトークン取得
```bash
python3 -c "
import jwt, time, requests

payload = {
    'iss': '<Consumer Key>',
    'sub': '<username>',
    'aud': 'https://login.salesforce.com',
    'exp': int(time.time()) + 300
}
token = jwt.encode(payload, open('key.pem').read(), algorithm='RS256')
res = requests.post('https://login.salesforce.com/services/oauth2/token', data={
    'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    'assertion': token
})
print(res.json())
"
```

### 2. access_tokenでAPIを叩く
```bash
curl https://<instance_url>/services/data/v59.0/sobjects/ \
  -H "Authorization: Bearer <access_token>"
```

## 通常のOAuthとの比較

| | JWT Bearer | 通常のOAuth |
|--|-----------|------------|
| ユーザー操作 | 不要 | ブラウザ認証が必要 |
| 用途 | サーバー間・バッチ処理 | ユーザー操作アプリ |
| 認証方式 | 秘密鍵で署名 | パスワード or 認可コード |
| access_token有効期限 | 短い（要再取得） | リフレッシュトークンあり |

## セキュリティ注意事項

- `key.pem` は絶対に外部に公開しない（`.gitignore` に追加）
- Consumer Key / Secret もコードに直書きせず環境変数で管理
- access_tokenは短命なので、都度取得するか期限管理を実装する
