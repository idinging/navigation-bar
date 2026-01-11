#!/usr/bin/env node
/**
 * 部署脚本
 * 解决Wrangler部署时的路径问题
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始部署个人导航网站...');

// 检查必要文件是否存在
const requiredFiles = [
  'src/server.js',
  'public/index.html',
  'wrangler.toml'
];

console.log('📋 检查必要文件...');
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`❌ 缺少必要文件: ${file}`);
    process.exit(1);
  }
  console.log(`✅ ${file}`);
}

// 检查public目录结构
console.log('📁 检查public目录结构...');
const publicFiles = [
  'public/index.html',
  'public/admin.html',
  'public/css/styles.css',
  'public/css/admin.css',
  'public/js/app.js',
  'public/js/admin.js'
];

for (const file of publicFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.warn(`⚠️  ${file} 不存在`);
  }
}

// 更新compatibility_date为最新
console.log('📅 更新compatibility_date...');
const today = new Date().toISOString().split('T')[0];
const wranglerConfig = fs.readFileSync('wrangler.toml', 'utf8');
const updatedConfig = wranglerConfig.replace(
  /compatibility_date = "[\d-]+"/,
  `compatibility_date = "${today}"`
);
fs.writeFileSync('wrangler.toml', updatedConfig);
console.log(`✅ 更新compatibility_date为: ${today}`);

try {
  console.log('🔨 执行部署...');
  
  // 使用npx确保使用最新版本的wrangler
  execSync('npx wrangler@latest deploy', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  console.log('🎉 部署成功！');
  console.log('🌐 你的网站现在已经在线了！');
  
} catch (error) {
  console.error('❌ 部署失败:', error.message);
  
  // 提供故障排除建议
  console.log('\n🔧 故障排除建议:');
  console.log('1. 检查wrangler登录状态: npx wrangler whoami');
  console.log('2. 确认账户权限: npx wrangler auth list');
  console.log('3. 手动部署: npx wrangler@latest deploy');
  console.log('4. 查看详细日志: npx wrangler@latest deploy --verbose');
  
  process.exit(1);
}
