# Elahe Panel

<div align="center">

**سیستم مدیریت تانل چند پروتکلی پیشرفته**

نسخه: 0.0.5 | توسعه‌دهنده: EHSANKiNG

[English](#english) | [فارسی](#فارسی)

</div>

---

## فارسی

### معرفی

**Elahe Panel** یک سیستم مدیریت تانل پیشرفته و چند پروتکلی است که برای مدیریت اتصالات شبکه‌ای امن طراحی شده است. این پنل از فناوری‌های روز دنیا برای ارائه سرویس‌های امن و پایدار استفاده می‌کند.

### ویژگی‌ها

- **پشتیبانی از پروتکل‌های متعدد**: VLESS-Reality, VMess, Trojan, Shadowsocks, Hysteria2, WireGuard, OpenVPN, TrustTunnel
- **پروتکل‌های XTLS**: RPRX-Direct, Vision, REALITY
- **سیستم اتوپایلوت**: انتخاب خودکار بهترین تانل هر 10 دقیقه
- **مسیریابی GeoIP/GeoData**: ادغام با [Iran-v2ray-rules](https://github.com/chocolate4u/Iran-v2ray-rules) برای جلوگیری از ارسال ترافیک سایت‌های داخلی به خارج
- **مدیریت هسته Xray/Sing-box**: نمایش نسخه‌ها، شروع/توقف/ریستارت، تشخیص تداخل پورت‌ها
- **پشتیبانی WARP**: عبور از سایت‌ها با Cloudflare WARP
- **مسدودسازی محتوا**: مدیریت و شناسایی ترافیک BitTorrent، پورنوگرافی و قمار
- **مدیریت ساب‌دامین و SSL**: صدور گواهی SSL برای ساب‌دامین‌ها از داخل پنل
- **پنل کاملاً فارسی**: رابط کاربری بومی‌سازی شده
- **نمایش کاربران آنلاین**: مشاهده وضعیت آنلاین کاربران برای مدیر
- **API امن**: کلیدهای API با قابلیت تنظیم دسترسی
- **کانفیگ پورت سفارشی**: امکان تنظیم دستی پورت در حالت ایران
- **پشتیبانی از حالت دوگانه**: ایران (استتار) و خارج (سرور DNS)
- **سازگاری با Marzban/3x-ui**: ورود/خروج کاربران
- **مانیتورینگ سیستم**: نمایش CPU، RAM، دیسک، پهنای باند

### پیش‌نیازها

- سرور لینوکس (Ubuntu 20+ / Debian 11+ / CentOS 8+)
- Node.js 18+
- حداقل 512 مگابایت RAM
- دسترسی root

### نصب سریع

```bash
bash <(curl -s https://raw.githubusercontent.com/ehsanking/Elahe/main/scripts/elahe.sh) install
```

### دستورات CLI

```bash
elahe install          # نصب
elahe update           # بروزرسانی
elahe set-domain       # تنظیم دامنه و SSL
elahe status           # وضعیت سرویس
elahe restart          # ریستارت سرویس
elahe uninstall        # حذف
```

### منابع GeoIP/GeoData

این پروژه از [Iran-v2ray-rules](https://github.com/chocolate4u/Iran-v2ray-rules) (توسعه‌دهنده: chocolate4u) برای قوانین مسیریابی GeoIP/GeoSite استفاده می‌کند. این مجموعه قوانین شامل:

- آدرس‌های IP ایران (برای مسیریابی مستقیم)
- سایت‌های ایرانی (برای جلوگیری از عبور از پروکسی)
- فیلتر تبلیغات و بدافزار
- قابلیت بروزرسانی خودکار از پنل

### عیب‌یابی 502 Bad Gateway (Nginx)

اگر خطای `502 Bad Gateway` دریافت می‌کنید، معمولاً Nginx به پورت اشتباهی از Node.js پروکسی می‌کند یا سرویس Node روی آن پورت بالا نیامده است.

1. بررسی صحت کانفیگ Nginx:
```bash
nginx -t
```
2. بررسی وضعیت سرویس‌ها:
```bash
systemctl status nginx --no-pager
systemctl status elahe --no-pager
```
3. بررسی پورت داخلی پنل از فایل `.env` (کلید `PORT`) و اطمینان از یکسان بودن آن با `proxy_pass` در کانفیگ Nginx.
4. مشاهده لاگ‌ها:
```bash
journalctl -u elahe -n 100 --no-pager
tail -n 100 /var/log/nginx/error.log
```

> در نسخه جدید اسکریپت‌های نصب، پورت upstream به صورت خودکار از `.env` خوانده می‌شود و قبل از ری‌استارت، تست `nginx -t` اجرا می‌گردد تا خطاهای 502 ناشی از عدم تطابق پورت کاهش یابد.

### پروتکل‌های پشتیبانی شده

| پروتکل | پورت پیش‌فرض | توضیحات |
|---------|-------------|---------|
| VLESS-Reality | 443 | XTLS با REALITY |
| TrustTunnel | 8443 | HTTP/3 (QUIC) |
| WireGuard | 1414, 53133 | همیشه فعال |
| OpenVPN | 110, 510 | همیشه فعال |
| VMess | 8080 | - |
| Trojan | 8443 | - |
| Shadowsocks | 8388 | - |
| Hysteria2 | 4433 | - |

---

## English

### Introduction

**Elahe Panel** is an advanced multi-protocol tunnel management system designed for secure network connection management.

### Features

- Multi-protocol support (VLESS-Reality, VMess, Trojan, Shadowsocks, Hysteria2, WireGuard, OpenVPN)
- XTLS native protocols: RPRX-Direct, Vision, REALITY
- Autopilot tunnel management
- GeoIP/GeoData routing with [Iran-v2ray-rules](https://github.com/chocolate4u/Iran-v2ray-rules) integration
- Xray/Sing-box core management with version control
- Cloudflare WARP support
- Content blocking (BitTorrent, Porn, Gambling)
- Subdomain management with SSL certificate issuance
- Full Persian/Farsi admin panel localization
- Online user monitoring
- Secure API with key management
- Custom port configuration
- Dual mode: Iran (camouflage) and Foreign (DNS provider)
- Marzban/3x-ui compatibility
- System monitoring (CPU, RAM, Disk, Bandwidth)

### 502 Bad Gateway (Nginx) Troubleshooting

A `502 Bad Gateway` usually means Nginx is proxying to the wrong Node.js upstream port, or the Elahe service is not listening on that port.

```bash
nginx -t
systemctl status nginx --no-pager
systemctl status elahe --no-pager
journalctl -u elahe -n 100 --no-pager
tail -n 100 /var/log/nginx/error.log
```

Make sure `PORT` in `.env` matches the Nginx `proxy_pass` upstream.

> Installer scripts now read upstream port from `.env` and run `nginx -t` before restarting Nginx to reduce 502 errors caused by port mismatch.

### Quick Install

```bash
bash <(curl -s https://raw.githubusercontent.com/ehsanking/Elahe/main/scripts/elahe.sh) install
```

---

## سلب مسئولیت قانونی / Legal Disclaimer

### فارسی

**هشدار مهم:** این نرم‌افزار صرفاً برای اهداف آموزشی و تحقیقاتی توسعه داده شده است.

1. **استفاده قانونی**: کاربران موظفند از این نرم‌افزار تنها در چارچوب قوانین کشور محل سکونت خود استفاده کنند.
2. **عدم مسئولیت**: توسعه‌دهندگان هیچ‌گونه مسئولیتی در قبال سوء استفاده از این نرم‌افزار ندارند.
3. **حریم خصوصی**: این نرم‌افزار هیچ اطلاعات شخصی کاربران را جمع‌آوری یا به اشخاص ثالث ارسال نمی‌کند.
4. **عدم تضمین**: این نرم‌افزار «همانطور که هست» ارائه می‌شود و هیچ تضمینی برای عملکرد صحیح آن وجود ندارد.
5. **محتوای غیرقانونی**: استفاده از این نرم‌افزار برای دسترسی به محتوای غیرقانونی، نقض حق کپی‌رایت، یا هرگونه فعالیت مجرمانه اکیداً ممنوع است.
6. **ریسک استفاده**: استفاده از این نرم‌افزار به عهده خود کاربر است و تمامی ریسک‌های ناشی از استفاده بر عهده کاربر می‌باشد.

### English

**IMPORTANT NOTICE:** This software is developed solely for educational and research purposes.

1. **Legal Use**: Users are obligated to use this software only within the legal framework of their country of residence.
2. **No Liability**: The developers bear no responsibility for any misuse of this software.
3. **Privacy**: This software does not collect or transmit any personal user data to third parties.
4. **No Warranty**: This software is provided "as is" without any warranty of any kind, express or implied.
5. **Illegal Content**: Using this software to access illegal content, violate copyright, or engage in any criminal activity is strictly prohibited.
6. **Use at Your Own Risk**: The use of this software is at the user's own risk, and all risks arising from its use are borne by the user.
7. **Compliance**: Users must comply with all applicable local, state, national, and international laws and regulations.

---

## مجوز / License

GNU General Public License v3.0 (GPL-3.0) - Copyright (c) 2024 EHSANKiNG

---

<div align="center">
  
**Elahe Panel v0.0.5** | توسعه‌دهنده: [EHSANKiNG](https://github.com/ehsanking)

</div>
