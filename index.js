import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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

  vec3 colorA = vec3(0.196, 0.631, 0.886);
  vec3 colorB = vec3(0.192, 0.384, 0.498);

  void main() {

    vec3  color = vec3(0.0);
    float pct   = abs(sin(u_time));
          color = mix(colorA, colorB, pct);

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
    color: 0x0b2636,
    transparent: true,
    opacity: 0.9,
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

  // 加载arc-texture纹理
  const textureLoader = new THREE.TextureLoader();
  const arcTextures = [
    textureLoader.load("img/arc-texture-1.png"),
    textureLoader.load("img/arc-texture-2.png"),
    textureLoader.load("img/arc-texture-3.png"),
    textureLoader.load("img/arc-texture-4.png"),
  ];

  // 飞线的顶点着色器 - 两阶段动画效果
  const flyingLineVertex = `
    attribute float progress;
    uniform float time;
    uniform float animationPhase;
    
    varying vec2 vUv;
    varying float vProgress;
    varying float vVisibility;
    
    void main() {
      vUv = uv;
      vProgress = progress;
      
      // 计算动画周期，每个周期6秒（3秒延伸 + 3秒收回）
      float cycleDuration = 6.0;
      float cycle = mod(time + animationPhase, cycleDuration);
      
      float visibility = 0.0;
      
      if (cycle < 3.0) {
        // 第一阶段：从起点延伸到终点（0-3秒）
        float animatedProgress = cycle / 3.0; // 0到1
        if (progress <= animatedProgress) {
          visibility = 1.0;
          // 头部渐变效果，让线条前端有柔和的渐变
          float headDistance = animatedProgress - progress;
          float headFade = 1.0 - smoothstep(0.0, 0.1, headDistance);
          visibility *= (0.6 + headFade * 0.8); // 基础亮度0.6，头部最亮1.4
        }
      } else {
        // 第二阶段：保持连接状态，从起点收回到终点（3-6秒）
        float retractProgress = (cycle - 3.0) / 3.0; // 0到1，表示收回的进度
        if (progress >= retractProgress) {
          visibility = 1.0;
          // 收回前端的渐变效果
          float retractDistance = progress - retractProgress;
          float retractFade = 1.0 - smoothstep(0.0, 0.1, retractDistance);
          visibility *= (0.6 + retractFade * 0.8); // 基础亮度0.6，收回前端最亮1.4
        }
      }
      
      vVisibility = visibility;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // 飞线的片段着色器 - 优化的视觉效果
  const flyingLineFragment = `
    varying vec2 vUv;
    varying float vProgress;
    varying float vVisibility;
    uniform vec3 color;
    uniform sampler2D arcTexture;
    
    void main() {
      // 如果不可见则丢弃像素
      if (vVisibility < 0.01) discard;
      
      // 采样纹理
      vec4 textureColor = texture2D(arcTexture, vUv);
      
      // 添加边缘柔化效果，让线条边缘更平滑
      float edgeFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
      
      // 结合纹理和颜色
      vec3 finalColor = mix(textureColor.rgb, color, 1.0);
      finalColor *= 1.0; // 大幅增加亮度让线条更明显
      
      float finalAlpha = textureColor.a * vVisibility * edgeFade;
      
      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `;

  // 计算两点间的贝塞尔曲线路径 - 优化版本
  const createCurvedPath = (start, end, segments = 60) => {
    const points = [];
    const distance = start.distanceTo(end);
    const height = Math.max(distance * 0.25, 3); // 稍微降低弧线高度

    // 计算控制点（弧线的最高点）
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const controlPoint = mid
      .clone()
      .normalize()
      .multiplyScalar(20 + height); // 使用与地球表面一致的基础半径

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

  // 从经纬度计算3D位置 - 统一使用与地图点相同的半径
  const latLonToVector3 = (lat, lon, radius = 20) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  };

  // 计算地球表面位置（用于端点圆心） - 与地图点位置完全一致
  const latLonToSurfaceVector3 = (lat, lon, radius = 20) => {
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

    // 创建一个平面几何体
    const geometry = new THREE.PlaneGeometry(1.5, 1.5);

    // 加载圆盘纹理
    const textureLoader = new THREE.TextureLoader();
    const discTexture = textureLoader.load("img/disc_texture.png");

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

  // 创建飞线 - 使用纹理平面
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

    // 创建沿路径的平面几何体来显示纹理
    const positions = [];
    const uvs = [];
    const indices = [];
    const progresses = [];

    const lineWidth = 0.12; // 进一步减小线宽，更接近图片中的细线效果

    for (let i = 0; i < pathPoints.length - 1; i++) {
      const currentPoint = pathPoints[i];
      const nextPoint = pathPoints[i + 1];
      const progress = i / (pathPoints.length - 1);
      const nextProgress = (i + 1) / (pathPoints.length - 1);

      // 计算线段方向
      const direction = new THREE.Vector3()
        .subVectors(nextPoint, currentPoint)
        .normalize();

      // 计算垂直于线段的向量，使用更稳定的方法
      const up = new THREE.Vector3(0, 1, 0);
      let perpendicular = new THREE.Vector3().crossVectors(direction, up);

      // 如果方向向量与up向量平行，使用另一个参考向量
      if (perpendicular.length() < 0.1) {
        perpendicular = new THREE.Vector3().crossVectors(
          direction,
          new THREE.Vector3(1, 0, 0)
        );
      }
      perpendicular.normalize();

      // 创建四个顶点形成矩形，使用更小的宽度
      const offset = perpendicular.multiplyScalar(lineWidth);

      const v1 = new THREE.Vector3().addVectors(currentPoint, offset);
      const v2 = new THREE.Vector3().subVectors(currentPoint, offset);
      const v3 = new THREE.Vector3().addVectors(nextPoint, offset);
      const v4 = new THREE.Vector3().subVectors(nextPoint, offset);

      const baseIndex = i * 4;

      // 添加顶点
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);
      positions.push(v3.x, v3.y, v3.z);
      positions.push(v4.x, v4.y, v4.z);

      // 添加UV坐标
      uvs.push(progress, 1);
      uvs.push(progress, 0);
      uvs.push(nextProgress, 1);
      uvs.push(nextProgress, 0);

      // 添加进度属性
      progresses.push(progress);
      progresses.push(progress);
      progresses.push(nextProgress);
      progresses.push(nextProgress);

      // 添加面索引
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute(
      "progress",
      new THREE.Float32BufferAttribute(progresses, 1)
    );
    geometry.setIndex(indices);

    const selectedTexture = arcTextures[textureIndex % arcTextures.length];
    const animationPhase = Math.random() * 6.0; // 随机动画相位（0-6秒），避免所有线同时动画

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, // 从0开始，统一时间管理
        animationPhase: { value: animationPhase },
        color: { value: color },
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

  // 添加一些示例飞线
  const routes = [
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

  // 创建不同颜色的飞线
  const colors = [
    new THREE.Vector3(0.3, 0.8, 1.0), // 蓝色
    new THREE.Vector3(1.0, 0.5, 0.3), // 橙色
    new THREE.Vector3(0.5, 1.0, 0.3), // 绿色
    new THREE.Vector3(1.0, 0.3, 0.8), // 粉色
    new THREE.Vector3(0.8, 0.8, 0.3), // 黄色
    new THREE.Vector3(0.6, 0.3, 1.0), // 紫色
  ];

  routes.forEach((route, index) => {
    createFlyingLine(
      route.start,
      route.end,
      colors[index % colors.length],
      index
    );
  });
};

const setMap = () => {
  let activeLatLon = {};
  const dotSphereRadius = 20;

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
    const dotDensity = 2.5;
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

        const dotGeometry = new THREE.CircleGeometry(0.1, 5);
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

  image.src = "img/world_alpha_mini.jpg";
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
      value: 1.07,
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

  // 更新飞线动画 - 加快连接速度
  if (flyingLineMaterials) {
    flyingLineMaterials.forEach((material) => {
      material.uniforms.time.value += 0.032; // 加快时间增量，让动画更快
    });
  }

  // 端点现在保持与地球表面一致的角度，不需要动态更新朝向

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render.bind(this));
};

setScene();
