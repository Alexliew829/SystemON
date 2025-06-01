# 修改 package.json，移除 "type": "module"，并改正 SUPABASE 表名注释
corrected_package_json = '''\
{
  "name": "system-on",
  "version": "1.0.0",
  "dependencies": {
    "@supabase/supabase-js": "^2.39.4",
    "node-fetch": "^2.6.9"
  }
}
'''

# 更新 trigger.js 中的表名为 "triggered_comments"
trigger_path = "/mnt/data/SystemON/api/trigger.js"
with open(trigger_path, "r") as f:
    trigger_content = f.read()

# 替换表名
trigger_content = trigger_content.replace(
    'process.env.SUPABASE_TABLE_NAME',
    '"triggered_comments"'
)

# 保存修改后的 trigger.js
with open(trigger_path, "w") as f:
    f.write(trigger_content)

# 保存更新后的 package.json
package_path = "/mnt/data/SystemON/api/package.json"
with open(package_path, "w") as f:
    f.write(corrected_package_json)

# 打包为新 zip
updated_zip_path = "/mnt/data/SystemON_updated.zip"
import zipfile
import os

with zipfile.ZipFile(updated_zip_path, 'w') as zipf:
    for root, _, files in os.walk("/mnt/data/SystemON"):
        for file in files:
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, "/mnt/data/SystemON")
            zipf.write(full_path, arcname)

updated_zip_path
