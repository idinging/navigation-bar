/**
 * 背景动画模块
 * 负责粒子背景动画效果
 */

/**
 * 粒子类
 */
class Particle {
  constructor(canvasWidth, canvasHeight) {
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.radius = Math.random() * 1.5 + 0.5;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * 更新粒子位置
   */
  update() {
    this.x += this.vx;
    this.y += this.vy;

    // 边界反弹
    if (this.x < 0 || this.x > this.canvasWidth) this.vx *= -1;
    if (this.y < 0 || this.y > this.canvasHeight) this.vy *= -1;
  }

  /**
   * 绘制粒子
   * @param {CanvasRenderingContext2D} ctx - 画布上下文
   */
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = document.body.classList.contains('dark-theme') 
      ? 'rgba(255,255,255,0.3)' 
      : 'rgba(0,0,0,0.2)';
    ctx.fill();
  }
}

/**
 * 背景动画管理器
 */
export class BackgroundAnimator {
  constructor(canvasId = 'bg-canvas') {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.particles = [];
    this.animationId = null;
    
    this.init();
  }

  /**
   * 初始化动画
   */
  init() {
    this.resize();
    this.createParticles();
    this.bindEvents();
    this.animate();
  }

  /**
   * 调整画布大小
   */
  resize() {
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  /**
   * 创建粒子
   */
  createParticles() {
    const particleCount = Math.floor(window.innerWidth * window.innerHeight / 20000);
    this.particles = Array.from(
      { length: particleCount }, 
      () => new Particle(window.innerWidth, window.innerHeight)
    );
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.createParticles();
    });
  }

  /**
   * 绘制连线
   */
  drawLines() {
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const dx = this.particles[i].x - this.particles[j].x;
        const dy = this.particles[i].y - this.particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 120) {
          this.ctx.beginPath();
          this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
          this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
          
          const opacity = document.body.classList.contains('dark-theme')
            ? 0.2 - distance / 600
            : 0.3 - distance / 400;
            
          this.ctx.strokeStyle = document.body.classList.contains('dark-theme')
            ? `rgba(255,255,255,${opacity})`
            : `rgba(0,0,0,${opacity})`;
          this.ctx.lineWidth = 0.5;
          this.ctx.stroke();
        }
      }
    }
  }

  /**
   * 动画循环
   */
  animate() {
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    // 更新和绘制粒子
    this.particles.forEach(particle => {
      particle.update();
      particle.draw(this.ctx);
    });
    
    // 绘制连线
    this.drawLines();
    
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  /**
   * 停止动画
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 重启动画
   */
  restart() {
    this.stop();
    this.animate();
  }
}
