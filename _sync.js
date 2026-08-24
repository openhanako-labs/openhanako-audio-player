var fs = require('fs');
var path = require('path');

var src = 'W:/Games/Hanako/plugins/hanako-audio-player';
var dst = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player';

function copyDir(s, d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  fs.readdirSync(s).forEach(function(f) {
    var sp = path.join(s, f);
    var dp = path.join(d, f);
    var st = fs.statSync(sp);
    if (st.isDirectory()) {
      // 跳过 .git 目录
      if (f === '.git') return;
      copyDir(sp, dp);
    } else {
      // 确保目标子目录存在
      var parentDir = path.dirname(dp);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.copyFileSync(sp, dp);
      console.log('copied:', path.relative(dst, dp));
    }
  });
}

copyDir(src, dst);
console.log('sync done');
