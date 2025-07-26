import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ==================== 配置区域 ====================

// 飞线路由配置
const FLYING_LINE_ROUTES = [
  // 北京到纽约
  {
    start: { lat: 39.9042, lon: 116.4074 },
    end: { lat: 40.7128, lon: -74.006 },
  },
  // 伦敦到东京
  {
    start: { lat: 51.5074, lon: -0.1278 },
    end: { lat: 35.6762, lon: 139.6503 },
  },
  // 悉尼到洛杉矶
  {
    start: { lat: -33.8688, lon: 151.2093 },
    end: { lat: 34.0522, lon: -118.2437 },
  },
  // 巴黎到上海
  {
    start: { lat: 48.8566, lon: 2.3522 },
    end: { lat: 31.2304, lon: 121.4737 },
  },
  // 迪拜到新加坡
  {
    start: { lat: 25.2048, lon: 55.2708 },
    end: { lat: 1.3521, lon: 103.8198 },
  },
  // 圣保罗到开普敦
  {
    start: { lat: -23.5505, lon: -46.6333 },
    end: { lat: -33.9249, lon: 18.4241 },
  },
];

// 飞线颜色配置
const FLYING_LINE_COLORS = [
  new THREE.Vector3(0.3, 0.8, 1.0), // 蓝色
  new THREE.Vector3(1.0, 0.5, 0.3), // 橙色
  new THREE.Vector3(0.5, 1.0, 0.3), // 绿色
  new THREE.Vector3(1.0, 0.3, 0.8), // 粉色
  new THREE.Vector3(0.8, 0.8, 0.3), // 黄色
  new THREE.Vector3(0.6, 0.3, 1.0), // 紫色
];

// 圆心点配置
const ENDPOINT_CONFIG = {
  size: 0.5, // 端点大小
  textureUrl: "img/disc_texture.png", // 端点纹理
};

// 地图点配置
const MAP_DOTS_CONFIG = {
  sphereRadius: 20, // 地球半径
  dotRadius: 0.1, // 地图点半径
  dotSegments: 5, // 地图点分段数
  dotDensity: 2.5, // 地图点密度
  worldTextureUrl: "img/world_alpha_mini.jpg", // 世界地图纹理
};

// 飞线动画配置
const FLYING_LINE_ANIMATION_CONFIG = {
  tubeRadius: 0.05, // 圆管半径
  radialSegments: 8, // 圆形截面分段数
  tubularSegments: 50, // 沿路径分段数
  animationSpeed: 0.032, // 动画速度
  cycleDuration: 4.0, // 动画周期（秒）
  arcHeight: 0.25, // 弧线高度系数
  minArcHeight: 3, // 最小弧线高度
};

// ==================== 配置区域结束 ====================

const vertex = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;
  uniform float u_maxExtrusion;

  void main() {

    vec3 newPosition = position;
    if(u_maxExtrusion > 1.0) newPosition.xyz = newPosition.xyz * u_maxExtrusion + sin(u_time);
    else newPosition.xyz = newPosition.xyz * u_maxExtrusion;

    gl_Position = projectionMatrix * modelViewMatrix * vec4( newPosition, 1.0 );

  }
`;
const fragment = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;

  // 科技感配色方案 - 青蓝色调
  vec3 colorA = vec3(0.0, 0.8, 1.0);    // 明亮的青色
  vec3 colorB = vec3(0.0, 0.4, 0.8);    // 深蓝色
  vec3 colorC = vec3(0.2, 1.0, 0.8);    // 青绿色

  void main() {

    vec3  color = vec3(0.0);
    float pct1  = abs(sin(u_time));
    float pct2  = abs(sin(u_time * 0.7 + 1.57)); // 相位偏移
    
    // 三色混合创造更丰富的科技感效果
    color = mix(colorA, colorB, pct1);
    color = mix(color, colorC, pct2 * 0.3);
    
    // 增加亮度和对比度
    color *= 1.2;

    gl_FragColor = vec4(color, 1.0);

  }
`;

const container = document.querySelector(".container");
const canvas = document.querySelector(".canvas");

let sizes,
  scene,
  camera,
  renderer,
  controls,
  raycaster,
  mouse,
  isIntersecting,
  twinkleTime,
  materials,
  material,
  baseMesh,
  minMouseDownFlag,
  mouseDown,
  grabbing,
  flyingLines,
  flyingLineMaterials;

const setScene = () => {
  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(30, sizes.width / sizes.height, 1, 1000);
  camera.position.z = 100;

  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const pointLight = new THREE.PointLight(0x081b26, 17, 200);
  pointLight.position.set(-50, 0, 60);
  scene.add(pointLight);
  scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 1.5));

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  isIntersecting = false;
  minMouseDownFlag = false;
  mouseDown = false;
  grabbing = false;

  setControls();
  setBaseSphere();
  setShaderMaterial();
  setMap();
  setFlyingLines();
  resize();
  listenTo();
  render();
};

const setControls = () => {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.enableDamping = true;
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI / 2 - 0.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.5;
};

const setBaseSphere = () => {
  const baseSphere = new THREE.SphereGeometry(19.5, 35, 35);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x001122, // 深蓝黑色，更有科技感
    transparent: true,
    opacity: 0.85,
    metalness: 0.3, // 增加金属质感
    roughness: 0.7,
    emissive: 0x002244, // 微弱的自发光效果
    emissiveIntensity: 0.1,
  });
  baseMesh = new THREE.Mesh(baseSphere, baseMaterial);
  scene.add(baseMesh);
};

const setShaderMaterial = () => {
  twinkleTime = 0.03;
  materials = [];
  material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      u_time: { value: 1.0 },
      u_maxExtrusion: { value: 1.0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
};

const setFlyingLines = () => {
  flyingLines = [];
  flyingLineMaterials = [];

  // 创建程序化纹理作为备用 - 不透明版本
  const createGradientTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");

    // 创建不透明的渐变
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(0.3, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(0.7, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 1.0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  };

  // 加载arc-texture纹理，如果失败则使用程序化纹理
  const textureLoader = new THREE.TextureLoader();
  const gradientTexture = createGradientTexture();

  const arcTextures = [
    gradientTexture, // 使用程序化纹理作为主要纹理
    gradientTexture,
    gradientTexture,
    gradientTexture,
  ];

  // 尝试加载外部纹理（如果存在的话）
  const tryLoadTexture = (url, index) => {
    textureLoader.load(
      url,
      (texture) => {
        arcTextures[index] = texture;
        console.log(`Loaded texture: ${url}`);
      },
      undefined,
      (error) => {
        console.log(
          `Failed to load texture: ${url}, using gradient texture instead`
        );
      }
    );
  };

  tryLoadTexture("img/arc-texture-1.png", 0);
  tryLoadTexture("img/arc-texture-2.png", 1);
  tryLoadTexture("img/arc-texture-3.png", 2);
  tryLoadTexture("img/arc-texture-4.png", 3);

  // 飞线的顶点着色器 - 两阶段动画效果
  const flyingLineVertex = `
    attribute float progress;
    uniform float time;
    uniform float animationPhase;
    
    varying vec2 vUv;
    varying float vProgress;
    varying float vVisibility;
    varying float vAnimationProgress;
    varying float vAnimationPhase;
    
    void main() {
      vUv = uv;
      vProgress = progress;
      
      // 计算动画周期，每个周期4秒（1秒延伸 + 2秒停留 + 1秒收回）
      float cycleDuration = 4.0;
      float cycle = mod(time + animationPhase, cycleDuration);
      
      float visibility = 0.0;
      float animationProgress = 0.0;
      float phase = 0.0; // 0 = 延伸阶段, 1 = 停留阶段, 2 = 收回阶段
      
      if (cycle < 1.0) {
        // 第一阶段：从起点延伸到终点（0-1秒）
        animationProgress = cycle / 1.0; // 0到1
        phase = 0.0;
        if (progress <= animationProgress) {
          visibility = 1.0; // 保持完全不透明，不添加头部渐变
        }
      } else if (cycle < 3.0) {
        // 第二阶段：保持完整连接状态（1-3秒，持续2秒）
        animationProgress = 1.0; // 保持完整状态
        phase = 1.0;
        visibility = 1.0; // 整条线都可见
        
        // 在停留阶段保持持续的渐变动画
        float stayTime = cycle - 1.0; // 停留阶段的时间（0-2秒）
        float pulseFreq = 2.0; // 脉冲频率
        float pulse = 0.5 + 0.3 * sin(stayTime * pulseFreq * 3.14159); // 0.2-0.8之间的脉冲
        
        // 添加沿线条的流动渐变效果
        float flowSpeed = 1.5; // 流动速度
        float flowOffset = mod(stayTime * flowSpeed, 1.0); // 0-1循环的偏移
        float flowGradient = 0.5 + 0.5 * sin((progress + flowOffset) * 6.28318); // 沿线条的正弦波
        
        visibility *= (0.7 + pulse * 0.3 + flowGradient * 0.2); // 组合脉冲和流动效果
      } else {
        // 第三阶段：从起点收回到终点（3-4秒）
        animationProgress = (cycle - 3.0) / 1.0; // 0到1，表示收回的进度
        phase = 2.0;
        if (progress >= animationProgress) {
          visibility = 1.0; // 保持完全不透明，不添加收回渐变
        }
      }
      
      vVisibility = visibility;
      vAnimationProgress = animationProgress;
      vAnimationPhase = phase;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // 飞线的片段着色器 - 动态纹理渐变效果
  const flyingLineFragment = `
    varying vec2 vUv;
    varying float vProgress;
    varying float vVisibility;
    varying float vAnimationProgress;
    varying float vAnimationPhase;
    uniform vec3 color;
    uniform float brightness;
    uniform sampler2D arcTexture;
    uniform float time;
    
    void main() {
      // 如果不可见则丢弃像素
      if (vVisibility < 0.01) discard;
      
      // 创建动态纹理坐标
      vec2 dynamicUv = vUv;
      
      if (vAnimationPhase < 0.5) {
        // 延伸阶段：纹理跟随动画前端移动
        float textureOffset = vAnimationProgress - 0.3; // 纹理稍微滞后于动画前端
        dynamicUv.x = (vUv.x - textureOffset) * 3.0; // 拉伸纹理，让渐变更明显
      } else if (vAnimationPhase < 1.5) {
        // 停留阶段：纹理保持动态流动，增强渐变效果
        float flowSpeed = 0.3; // 增加流动速度
        float textureOffset = time * flowSpeed;
        
        // 添加双向流动效果，创造更丰富的渐变
        float wave1 = sin(time * 2.0 + vProgress * 6.28318) * 0.1;
        float wave2 = cos(time * 1.5 - vProgress * 4.0) * 0.05;
        
        dynamicUv.x = vUv.x + textureOffset + wave1 + wave2;
      } else {
        // 收回阶段：纹理跟随收回前端移动
        float textureOffset = vAnimationProgress + 0.3; // 纹理稍微超前于收回前端
        dynamicUv.x = (vUv.x - textureOffset) * 3.0;
      }
      
      // 采样纹理
      vec4 textureColor = texture2D(arcTexture, dynamicUv);
      
      // 圆形管道的边缘柔化效果 - 只在径向方向柔化，不影响首尾
      float radialDistance = abs(vUv.y - 0.5) * 2.0; // 0到1，表示距离管道中心轴的距离
      float edgeFade = 1.0 - smoothstep(0.6, 1.0, radialDistance); // 只在管道边缘柔化
      
      // 创建流动的渐变效果
      float flowGradient = 1.0;
      if (vAnimationPhase < 0.5) {
        // 延伸阶段：保持均匀亮度，不添加头部渐变
        flowGradient = 1.0;
      } else if (vAnimationPhase < 1.5) {
        // 停留阶段：保持动态渐变效果
        float stayTime = time * 0.5; // 控制停留阶段的动画速度
        
        // 创建沿线条流动的渐变波
        float wave1 = 0.6 + 0.4 * sin(stayTime * 3.0 + vProgress * 8.0);
        float wave2 = 0.5 + 0.3 * cos(stayTime * 2.0 - vProgress * 5.0);
        
        // 添加整体的呼吸效果
        float breathe = 0.8 + 0.2 * sin(stayTime * 1.5);
        
        flowGradient = (wave1 + wave2) * 0.5 * breathe;
      } else {
        // 收回阶段：保持均匀亮度，不添加尾部渐变
        flowGradient = 1.0;
      }
      
      // 增强纹理效果 - 不依赖透明度
      float textureIntensity = textureColor.r;
      
      // 结合纹理、颜色、亮度和流动渐变，创造不透明的效果
      vec3 finalColor = color * brightness * (0.5 + textureIntensity * 0.5 + flowGradient * 0.8);
      
      // 设置为不透明，只保留可见性控制
      float finalAlpha = vVisibility * edgeFade;
      
      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `;

  // 计算两点间的贝塞尔曲线路径 - 优化版本
  const createCurvedPath = (start, end, segments = 60) => {
    const points = [];
    const distance = start.distanceTo(end);
    const height = Math.max(
      distance * FLYING_LINE_ANIMATION_CONFIG.arcHeight,
      FLYING_LINE_ANIMATION_CONFIG.minArcHeight
    );

    // 计算控制点（弧线的最高点）
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const controlPoint = mid
      .clone()
      .normalize()
      .multiplyScalar(MAP_DOTS_CONFIG.sphereRadius + height);

    // 生成更平滑的贝塞尔曲线点
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;

      // 使用平滑的插值函数
      const smoothT = t * t * (3 - 2 * t); // smoothstep函数

      const point = new THREE.Vector3();

      // 二次贝塞尔曲线公式
      point.x =
        (1 - smoothT) * (1 - smoothT) * start.x +
        2 * (1 - smoothT) * smoothT * controlPoint.x +
        smoothT * smoothT * end.x;
      point.y =
        (1 - smoothT) * (1 - smoothT) * start.y +
        2 * (1 - smoothT) * smoothT * controlPoint.y +
        smoothT * smoothT * end.y;
      point.z =
        (1 - smoothT) * (1 - smoothT) * start.z +
        2 * (1 - smoothT) * smoothT * controlPoint.z +
        smoothT * smoothT * end.z;

      points.push(point);
    }

    return points;
  };

  // 计算地球表面位置（用于端点圆心） - 与地图点位置完全一致
  const latLonToSurfaceVector3 = (
    lat,
    lon,
    radius = MAP_DOTS_CONFIG.sphereRadius
  ) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  };

  // 创建端点标记 - 贴在地球表面
  const createEndPoint = (latLon, color) => {
    // 使用地球表面位置
    const surfacePosition = latLonToSurfaceVector3(latLon.lat, latLon.lon);

    // 创建一个平面几何体，使用配置的端点大小
    const geometry = new THREE.PlaneGeometry(
      ENDPOINT_CONFIG.size,
      ENDPOINT_CONFIG.size
    );

    // 加载圆盘纹理
    const textureLoader = new THREE.TextureLoader();
    const discTexture = textureLoader.load(ENDPOINT_CONFIG.textureUrl);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: color },
        discTexture: { value: discTexture },
      },
      vertexShader: `
        #ifdef GL_ES
        precision mediump float;
        #endif
        
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        #ifdef GL_ES
        precision mediump float;
        #endif
        
        uniform vec3 color;
        uniform sampler2D discTexture;
        varying vec2 vUv;
        
        void main() {
          // 采样纹理
          vec4 textureColor = texture2D(discTexture, vUv);
          
          // 使用纹理的alpha通道作为透明度
          float alpha = textureColor.a;
          
          // 如果完全透明则丢弃像素
          if (alpha < 0.01) discard;
          
          // 使用传入的颜色，但保持纹理的形状和透明度
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(surfacePosition);

    // 计算地球表面的法向量（从球心指向表面点）
    const normal = surfacePosition.clone().normalize();

    // 让平面的法向量与地球表面的法向量一致
    mesh.lookAt(surfacePosition.clone().add(normal));

    scene.add(mesh);

    return mesh;
  };

  // 创建飞线 - 使用圆形管道几何体
  const createFlyingLine = (
    startLatLon,
    endLatLon,
    color = new THREE.Vector3(0.3, 0.8, 1.0),
    textureIndex = 0
  ) => {
    // 使用与圆点完全相同的位置计算方法
    const startPos = latLonToSurfaceVector3(startLatLon.lat, startLatLon.lon);
    const endPos = latLonToSurfaceVector3(endLatLon.lat, endLatLon.lon);

    const pathPoints = createCurvedPath(startPos, endPos, 50);

    // 创建曲线路径
    const curve = new THREE.CatmullRomCurve3(pathPoints);

    // 创建圆形管道几何体，使用配置参数
    const geometry = new THREE.TubeGeometry(
      curve,
      FLYING_LINE_ANIMATION_CONFIG.tubularSegments,
      FLYING_LINE_ANIMATION_CONFIG.tubeRadius,
      FLYING_LINE_ANIMATION_CONFIG.radialSegments,
      false
    );

    // 添加进度属性到几何体
    const positions = geometry.attributes.position;
    const progresses = [];

    for (let i = 0; i < positions.count; i++) {
      // 计算每个顶点沿管道的进度（0到1）
      const segmentIndex = Math.floor(
        i / (FLYING_LINE_ANIMATION_CONFIG.radialSegments + 1)
      );
      const progress =
        segmentIndex / FLYING_LINE_ANIMATION_CONFIG.tubularSegments;
      progresses.push(progress);
    }

    geometry.setAttribute(
      "progress",
      new THREE.Float32BufferAttribute(progresses, 1)
    );

    const selectedTexture = arcTextures[textureIndex % arcTextures.length];
    const animationPhase =
      Math.random() * FLYING_LINE_ANIMATION_CONFIG.cycleDuration; // 随机动画相位，避免所有线同时动画

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, // 从0开始，统一时间管理
        animationPhase: { value: animationPhase },
        color: { value: color },
        brightness: { value: 1.0 },
        arcTexture: { value: selectedTexture },
      },
      vertexShader: flyingLineVertex,
      fragmentShader: flyingLineFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    flyingLineMaterials.push(material);

    const line = new THREE.Mesh(geometry, material);
    scene.add(line);
    flyingLines.push(line);

    // 创建起点和终点的标记
    createEndPoint(startLatLon, color);
    createEndPoint(endLatLon, color);
  };

  // 使用配置创建飞线
  FLYING_LINE_ROUTES.forEach((route, index) => {
    createFlyingLine(
      route.start,
      route.end,
      FLYING_LINE_COLORS[index % FLYING_LINE_COLORS.length],
      index
    );
  });
};

const setMap = () => {
  let activeLatLon = {};
  const dotSphereRadius = MAP_DOTS_CONFIG.sphereRadius;

  const readImageData = (imageData) => {
    for (let i = 0, lon = -180, lat = 90; i < imageData.length; i += 4, lon++) {
      if (!activeLatLon[lat]) activeLatLon[lat] = [];

      const red = imageData[i];
      const green = imageData[i + 1];
      const blue = imageData[i + 2];

      if (red < 80 && green < 80 && blue < 80) activeLatLon[lat].push(lon);

      if (lon === 180) {
        lon = -180;
        lat--;
      }
    }
  };

  const visibilityForCoordinate = (lon, lat) => {
    let visible = false;

    if (!activeLatLon[lat].length) return visible;

    const closest = activeLatLon[lat].reduce((prev, curr) => {
      return Math.abs(curr - lon) < Math.abs(prev - lon) ? curr : prev;
    });

    if (Math.abs(lon - closest) < 0.5) visible = true;

    return visible;
  };

  const calcPosFromLatLonRad = (lon, lat) => {
    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lon + 180) * (Math.PI / 180);

    const x = -(dotSphereRadius * Math.sin(phi) * Math.cos(theta));
    const z = dotSphereRadius * Math.sin(phi) * Math.sin(theta);
    const y = dotSphereRadius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  };

  const createMaterial = (timeValue) => {
    const mat = material.clone();
    mat.uniforms.u_time.value = timeValue * Math.sin(Math.random());
    materials.push(mat);
    return mat;
  };

  const setDots = () => {
    const dotDensity = MAP_DOTS_CONFIG.dotDensity;
    let vector = new THREE.Vector3();

    for (let lat = 90, i = 0; lat > -90; lat--, i++) {
      const radius =
        Math.cos(Math.abs(lat) * (Math.PI / 180)) * dotSphereRadius;
      const circumference = radius * Math.PI * 2;
      const dotsForLat = circumference * dotDensity;

      for (let x = 0; x < dotsForLat; x++) {
        const long = -180 + (x * 360) / dotsForLat;

        if (!visibilityForCoordinate(long, lat)) continue;

        vector = calcPosFromLatLonRad(long, lat);

        const dotGeometry = new THREE.CircleGeometry(
          MAP_DOTS_CONFIG.dotRadius,
          MAP_DOTS_CONFIG.dotSegments
        );
        dotGeometry.lookAt(vector);
        dotGeometry.translate(vector.x, vector.y, vector.z);

        const m = createMaterial(i);
        const mesh = new THREE.Mesh(dotGeometry, m);

        scene.add(mesh);
      }
    }
  };

  const image = new Image();
  image.onload = () => {
    image.needsUpdate = true;

    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = image.width;
    imageCanvas.height = image.height;

    const context = imageCanvas.getContext("2d");
    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(
      0,
      0,
      imageCanvas.width,
      imageCanvas.height
    );
    readImageData(imageData.data);

    setDots();
  };

  image.src = MAP_DOTS_CONFIG.worldTextureUrl;
};

const resize = () => {
  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  if (window.innerWidth > 700) camera.position.z = 100;
  else camera.position.z = 140;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
};

const mousemove = (event) => {
  isIntersecting = false;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(baseMesh);
  if (intersects[0]) {
    isIntersecting = true;
    if (!grabbing) document.body.style.cursor = "pointer";
  } else {
    if (!grabbing) document.body.style.cursor = "default";
  }
};

const mousedown = () => {
  if (!isIntersecting) return;

  materials.forEach((el) => {
    gsap.to(el.uniforms.u_maxExtrusion, {
      value: 1.01,
    });
  });

  mouseDown = true;
  minMouseDownFlag = false;

  setTimeout(() => {
    minMouseDownFlag = true;
    if (!mouseDown) mouseup();
  }, 500);

  document.body.style.cursor = "grabbing";
  grabbing = true;
};

const mouseup = () => {
  mouseDown = false;
  if (!minMouseDownFlag) return;

  materials.forEach((el) => {
    gsap.to(el.uniforms.u_maxExtrusion, {
      value: 1.0,
      duration: 0.15,
    });
  });

  grabbing = false;
  if (isIntersecting) document.body.style.cursor = "pointer";
  else document.body.style.cursor = "default";
};

const listenTo = () => {
  window.addEventListener("resize", resize.bind(this));
  window.addEventListener("mousemove", mousemove.bind(this));
  window.addEventListener("mousedown", mousedown.bind(this));
  window.addEventListener("mouseup", mouseup.bind(this));
};

const render = () => {
  materials.forEach((el) => {
    el.uniforms.u_time.value += twinkleTime;
  });

  // 更新飞线动画
  if (flyingLineMaterials) {
    flyingLineMaterials.forEach((material) => {
      material.uniforms.time.value +=
        FLYING_LINE_ANIMATION_CONFIG.animationSpeed;
    });
  }

  // 端点现在保持与地球表面一致的角度，不需要动态更新朝向

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render.bind(this));
};

setScene();
