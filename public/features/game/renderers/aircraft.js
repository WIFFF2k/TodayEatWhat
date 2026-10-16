// 使用 WebGL 光照与透视投影绘制三维战机模型
export function createAircraftRenderer() {
  // 创建离屏三维渲染器，复用于所有战机以限制显存占用
  const surface = document.createElement('canvas');
  surface.width = surface.height = 256;
  const gl = surface.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) throw new Error('当前浏览器无法开启三维空战，请启用硬件加速后重试');
  const vertex = compile(gl, gl.VERTEX_SHADER, `
    attribute vec3 position; attribute vec3 normal;
    uniform float bank; uniform float facing;
    varying float light;
    void main() {
      float c = cos(bank), s = sin(bank);
      mat3 roll = mat3(c,0.,s, 0.,1.,0., -s,0.,c);
      mat3 tilt = mat3(1.,0.,0., 0.,.90,.435, 0.,-.435,.90);
      mat3 turn = mat3(facing,0.,0., 0.,facing,0., 0.,0.,1.);
      vec3 p = tilt * turn * roll * position;
      vec3 n = normalize(tilt * turn * roll * normal);
      light = .28 + .72 * max(dot(n, normalize(vec3(-.5,.7,1.))), 0.);
      float depth = 3.8 - p.z;
      gl_Position = vec4(p.xy * 2.6, -p.z * .3, depth);
    }`);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec3 color; varying float light;
    void main() { gl_FragColor = vec4(color * light, 1.); }`);
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program); gl.enable(gl.DEPTH_TEST);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, offset] of [['position', 0], ['normal', 12]]) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
  }
  const color = gl.getUniformLocation(program, 'color');
  const bank = gl.getUniformLocation(program, 'bank');
  const facing = gl.getUniformLocation(program, 'facing');
  return {
    draw(ctx, x, y, tint, player, variant, angle) {
      // 每种敌机使用不同翼展，机身、机翼和座舱均为有厚度的网格
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(bank, angle); gl.uniform1f(facing, player ? 1 : -1);
      const rgb = tint.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
      const parts = [
        { points: [[0,1.15],[.23,-.65],[0,-.9],[-.23,-.65]], depth:.22, color:rgb },
        { points: [[-.13,.25],[-1.05-variant*.13,-.55],[-.28,-.4]], depth:.07, color:rgb },
        { points: [[.13,.25],[.28,-.4],[1.05+variant*.13,-.55]], depth:.07, color:rgb },
        { points: [[-.1,-.4],[-.58,-.95],[-.12,-.73]], depth:.1, color:rgb },
        { points: [[.1,-.4],[.12,-.73],[.58,-.95]], depth:.1, color:rgb },
        { points: [[0,.58],[.12,-.12],[0,-.3],[-.12,-.12]], depth:.4, color:[.55,.92,1] }
      ];
      for (const part of parts) {
        const vertices = prism(part.points, part.depth);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
        gl.uniform3fv(color, part.color); gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
      }
      ctx.drawImage(surface, x-65, y-65, 130, 130);
    },
    dispose() {
      // 页面卸载时释放着色器、缓冲区和三维上下文
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}

function compile(gl, type, source) {
  // 编译着色器并报告真实图形错误
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function prism(points, depth) {
  // 将平面轮廓挤出为带法线的封闭立体网格
  const data = [];
  const triangle = (a,b,c) => {
    // 由顶点叉积计算表面法线并写入交错缓冲
    const u=b.map((v,i)=>v-a[i]), v=c.map((value,i)=>value-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for (const point of [a,b,c]) data.push(...point,...n);
  };
  for (let i=1;i<points.length-1;i++) {
    triangle([...points[0],depth],[...points[i],depth],[...points[i+1],depth]);
    triangle([...points[0],0],[...points[i+1],0],[...points[i],0]);
  }
  for (let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    triangle([...a,0],[...b,0],[...b,depth]); triangle([...a,0],[...b,depth],[...a,depth]);
  }
  return data;
}
