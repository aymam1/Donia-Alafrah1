# ERP Attendance (QR-based)

نظام بسيط لتسجيل حضور وانصراف عبر QR بدون تسجيل دخول.

- افتح خادم: `npm install` ثم `npm start`
- Employee URL: `http://localhost:3000/employee/<token>`
- Admin URL: `http://localhost:3000/admin/<token>`

لإنشاء QR: استخدم رابط الصفحة مع التوكن. مثال باستخدام Google Chart API:

https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=http://yourdomain/employee/<token>

ملف `data.db` سيُنشأ تلقائياً داخل المجلد المشروع ويحتوي على الموظفين والسجلات.

ملاحظات أمنية: التوكن في الرابط هو آلية مبسطة؛ لمنع الوصول غير المصرح به استخدم HTTPS وأعد التفكير في طرق المصادقة إذا لزم الأمر.
