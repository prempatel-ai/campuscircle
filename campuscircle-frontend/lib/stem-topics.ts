export const STEM_CATEGORIES: Record<string, Record<string, {title: string, url: string}[]>> = {
  "Computer Science": {
    "Web Development": [
      { title: "React in 100 Seconds", url: "https://www.youtube.com/watch?v=Tn6-PIqc4UM" },
      { title: "Next.js App Router Crash Course", url: "https://www.youtube.com/watch?v=ZjAqacIC_3c" },
      { title: "CSS Flexbox in 100 Seconds", url: "https://www.youtube.com/watch?v=K74l26pE4YA" },
      { title: "Vue.js in 100 Seconds", url: "https://www.youtube.com/watch?v=nhBVL41-_Cw" },
      { title: "HTML & CSS Crash Course", url: "https://www.youtube.com/watch?v=mU6anWqZJcc" },
      { title: "TypeScript in 100 Seconds", url: "https://www.youtube.com/watch?v=zQnBQ4tB3ZA" },
      { title: "Svelte in 100 Seconds", url: "https://www.youtube.com/watch?v=rv3Yq-B8qp4" },
      { title: "Tailwind CSS in 100 Seconds", url: "https://www.youtube.com/watch?v=mr15Xzb1Ook" },
    ],
    "App Development": [
      { title: "Flutter in 100 Seconds", url: "https://www.youtube.com/watch?v=lHhRhPVjGtg" },
      { title: "React Native in 100 Seconds", url: "https://www.youtube.com/watch?v=gvkqT_Uoahw" },
      { title: "Swift in 100 Seconds", url: "https://www.youtube.com/watch?v=nWItaXPAhA8" },
      { title: "Kotlin in 100 Seconds", url: "https://www.youtube.com/watch?v=xT8oPfg1bDg" },
      { title: "Android Studio Tutorial", url: "https://www.youtube.com/watch?v=fis26HvvDII" },
    ],
    "Artificial Intelligence": [
      { title: "Machine Learning in 100 Seconds", url: "https://www.youtube.com/watch?v=PeMlggyqz0Y" },
      { title: "But what is a neural network?", url: "https://www.youtube.com/watch?v=aircAruvnKk" },
      { title: "Gradient descent, how neural networks learn", url: "https://www.youtube.com/watch?v=IHZwWFHWa-w" },
      { title: "What is Backpropagation?", url: "https://www.youtube.com/watch?v=Ilg3gGewQ5U" },
      { title: "Transformers, explained", url: "https://www.youtube.com/watch?v=zxQyTK8quyY" },
      { title: "Attention in Neural Networks", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
      { title: "Large Language Models Explained", url: "https://www.youtube.com/watch?v=5sLYAQS9sWQ" },
      { title: "Deep Learning Crash Course", url: "https://www.youtube.com/watch?v=vyNd_2uB8Q4" }
    ],
    "Data Science": [
      { title: "Pandas in 100 Seconds", url: "https://www.youtube.com/watch?v=dcqPhpY7tWk" },
      { title: "NumPy Crash Course", url: "https://www.youtube.com/watch?v=QUT1VHiLmmI" },
      { title: "What is Data Science?", url: "https://www.youtube.com/watch?v=X3paOmcrTjQ" },
      { title: "Data Visualization in Python", url: "https://www.youtube.com/watch?v=a9UrKTVEeZA" },
      { title: "Statistics for Data Science", url: "https://www.youtube.com/watch?v=Vfo5le26IhY" },
    ],
    "Cyber Security": [
      { title: "Cybersecurity in 100 Seconds", url: "https://www.youtube.com/watch?v=inWWhr5tnEA" },
      { title: "SQL Injection Explained", url: "https://www.youtube.com/watch?v=ciNHn38FEhY" },
      { title: "Cross-Site Scripting (XSS)", url: "https://www.youtube.com/watch?v=EoaDgUgS6QA" },
      { title: "How HTTPS works", url: "https://www.youtube.com/watch?v=T4Df5_cojAs" },
      { title: "Public Key Cryptography", url: "https://www.youtube.com/watch?v=AQDCe585Lnc" },
      { title: "Buffer Overflows Explained", url: "https://www.youtube.com/watch?v=1S0aBV-Waeo" }
    ],
    "Data Structures & Algorithms": [
      { title: "Binary Search Trees", url: "https://www.youtube.com/watch?v=pYT9F8_LFTM" },
      { title: "Hash Tables", url: "https://www.youtube.com/watch?v=KyUTuwz_b7Q" },
      { title: "Dynamic Programming", url: "https://www.youtube.com/watch?v=oBt53YbR9Kk" },
      { title: "Graph Algorithms", url: "https://www.youtube.com/watch?v=tWVWeAqZ0WU" },
      { title: "Sorting Algorithms", url: "https://www.youtube.com/watch?v=kPRA0W1kECg" },
      { title: "Big O Notation", url: "https://www.youtube.com/watch?v=D6xkbGLQesk" }
    ]
  },
  "Mathematics": {
    "Calculus": [
      { title: "Essence of Calculus", url: "https://www.youtube.com/watch?v=WUvTyaaNkzM" },
      { title: "The paradox of the derivative", url: "https://www.youtube.com/watch?v=9vKqVkMQHKk" },
      { title: "Derivative formulas through geometry", url: "https://www.youtube.com/watch?v=S0_qX4VJhMQ" },
      { title: "Visualizing the chain rule", url: "https://www.youtube.com/watch?v=YG15m2VwSjA" },
      { title: "Integration and the fundamental theorem", url: "https://www.youtube.com/watch?v=rfG8ce4nNh0" },
      { title: "What does area have to do with slope?", url: "https://www.youtube.com/watch?v=FnJqaIESC2s" }
    ],
    "Linear Algebra": [
      { title: "Vectors | Essence of linear algebra", url: "https://www.youtube.com/watch?v=fNk_zzaMoSs" },
      { title: "Linear combinations and span", url: "https://www.youtube.com/watch?v=k7RM-ot2NWY" },
      { title: "Matrices as linear transformations", url: "https://www.youtube.com/watch?v=kYB8IZa5AuE" },
      { title: "Matrix multiplication as composition", url: "https://www.youtube.com/watch?v=XkY2DOUCWMU" },
      { title: "The determinant", url: "https://www.youtube.com/watch?v=Ip3X9LOh2dk" },
      { title: "Eigenvectors and eigenvalues", url: "https://www.youtube.com/watch?v=PFDu9oVAE-g" },
      { title: "Dot products and duality", url: "https://www.youtube.com/watch?v=LyGKycYT2v0" }
    ],
    "Probability & Statistics": [
      { title: "Bayes theorem", url: "https://www.youtube.com/watch?v=HZGCoVF3YvM" },
      { title: "The binomial distribution", url: "https://www.youtube.com/watch?v=8idr1WZ1A7Q" },
      { title: "Normal distribution", url: "https://www.youtube.com/watch?v=zeJD6dqJ5lo" },
      { title: "Central limit theorem", url: "https://www.youtube.com/watch?v=YAlJCIGH2u0" }
    ],
    "Discrete Math": [
      { title: "Set Theory Introduction", url: "https://www.youtube.com/watch?v=tyDKR4FG3Yw" },
      { title: "Logic Gates and Truth Tables", url: "https://www.youtube.com/watch?v=mGjzcvh4XzE" },
      { title: "Graph Theory Introduction", url: "https://www.youtube.com/watch?v=LFKZLXUPF-E" }
    ]
  },
  "Physics": {
    "Mechanics": [
      { title: "Newton's Laws of Motion", url: "https://www.youtube.com/watch?v=kKKM8Y-u7ds" },
      { title: "Work and Energy", url: "https://www.youtube.com/watch?v=w4QFJb9a8vo" },
      { title: "Conservation of Momentum", url: "https://www.youtube.com/watch?v=Y-QOfc2XqOk" },
      { title: "Rotational Motion", url: "https://www.youtube.com/watch?v=b-MQjQ6Y_2Q" }
    ],
    "Quantum Physics": [
      { title: "The Double Slit Experiment", url: "https://www.youtube.com/watch?v=A9tKncAdlHQ" },
      { title: "Schrödinger's cat", url: "https://www.youtube.com/watch?v=UjaAxUO6-Uw" },
      { title: "Quantum Entanglement", url: "https://www.youtube.com/watch?v=ZuvK-od647c" },
      { title: "Heisenberg Uncertainty Principle", url: "https://www.youtube.com/watch?v=TQKbLQWSoww" }
    ],
    "Electromagnetism": [
      { title: "Coulomb's Law", url: "https://www.youtube.com/watch?v=FI1XEQ3L1mU" },
      { title: "Electric Fields", url: "https://www.youtube.com/watch?v=mdjz-W2BwQo" },
      { title: "Magnetic Fields", url: "https://www.youtube.com/watch?v=sqnNnU_W13w" },
      { title: "Maxwell's Equations", url: "https://www.youtube.com/watch?v=KjW5Hk3heoQ" }
    ],
    "Thermodynamics": [
      { title: "Laws of Thermodynamics", url: "https://www.youtube.com/watch?v=8N1BxHgsoOw" },
      { title: "Entropy Explained", url: "https://www.youtube.com/watch?v=YM-uykVfq_E" },
      { title: "Heat Engines", url: "https://www.youtube.com/watch?v=q6q-K2J2s40" }
    ]
  },
  "Chemistry": {
    "Organic Chemistry": [
      { title: "Introduction to Organic Chemistry", url: "https://www.youtube.com/watch?v=U3j4I_3z3G8" },
      { title: "Naming Organic Compounds", url: "https://www.youtube.com/watch?v=zWio83O3nBo" },
      { title: "Stereochemistry", url: "https://www.youtube.com/watch?v=7uU3pQoY3qg" },
      { title: "SN1 and SN2 Reactions", url: "https://www.youtube.com/watch?v=Xy_3R7Wq7yQ" }
    ],
    "Physical Chemistry": [
      { title: "Chemical Kinetics", url: "https://www.youtube.com/watch?v=7qOFtL3VEBc" },
      { title: "Chemical Equilibrium", url: "https://www.youtube.com/watch?v=dUMmoPdwBy4" },
      { title: "Acids and Bases", url: "https://www.youtube.com/watch?v=8E1jA4U0oH4" }
    ],
    "Inorganic Chemistry": [
      { title: "Periodic Table Explained", url: "https://www.youtube.com/watch?v=0RRVV4Diomg" },
      { title: "Chemical Bonding", url: "https://www.youtube.com/watch?v=a8OUc4V0b4g" },
      { title: "Transition Metals", url: "https://www.youtube.com/watch?v=d_2yR1W9jMw" }
    ]
  },
  "Biology & Medicine": {
    "Genetics": [
      { title: "DNA Structure and Replication", url: "https://www.youtube.com/watch?v=8kK2zwjRV0M" },
      { title: "Transcription and Translation", url: "https://www.youtube.com/watch?v=gG7uCskUOrA" },
      { title: "Mendelian Genetics", url: "https://www.youtube.com/watch?v=NWqgZUnJdAY" },
      { title: "CRISPR Explained", url: "https://www.youtube.com/watch?v=UKbrwPL3wXE" }
    ],
    "Cellular Biology": [
      { title: "Introduction to Cells", url: "https://www.youtube.com/watch?v=8IlzKri08kk" },
      { title: "Cellular Respiration", url: "https://www.youtube.com/watch?v=4Eo7JtRA7ls" },
      { title: "Photosynthesis", url: "https://www.youtube.com/watch?v=sQK3Yr4Sc_k" },
      { title: "Mitosis and Meiosis", url: "https://www.youtube.com/watch?v=f-jxB3q3iFw" }
    ],
    "Human Anatomy": [
      { title: "The Nervous System", url: "https://www.youtube.com/watch?v=qPix_X-9t7E" },
      { title: "The Circulatory System", url: "https://www.youtube.com/watch?v=CWFyxn0qDEU" },
      { title: "The Immune System", url: "https://www.youtube.com/watch?v=zQGOcOUBi6s" }
    ]
  },
  "Engineering": {
    "Electrical Engineering": [
      { title: "Voltage, Current, Resistance", url: "https://www.youtube.com/watch?v=J4Vq-xHqUo8" },
      { title: "Capacitors Explained", url: "https://www.youtube.com/watch?v=X4EUwTwZ110" },
      { title: "Transistors, How do they work?", url: "https://www.youtube.com/watch?v=IcrBqCBuC4" },
      { title: "How Electric Motors Work", url: "https://www.youtube.com/watch?v=CWulQ1ZSE3c" }
    ],
    "Mechanical Engineering": [
      { title: "How an Engine Works", url: "https://www.youtube.com/watch?v=DZt5xdW8_Ow" },
      { title: "Aerodynamics Explained", url: "https://www.youtube.com/watch?v=p0ZBCyyE7yQ" },
      { title: "Gears and Pulleys", url: "https://www.youtube.com/watch?v=D_i3PJIYtuY" }
    ],
    "Civil Engineering": [
      { title: "How Bridges Work", url: "https://www.youtube.com/watch?v=y3h2BtyaX4w" },
      { title: "Skyscraper Construction", url: "https://www.youtube.com/watch?v=H7Z4O7Xh7z8" },
      { title: "Water Treatment Processes", url: "https://www.youtube.com/watch?v=8wU9B_V9Q-8" }
    ]
  },
  "Other": {
    "General STEM": [
      { title: "The Map of Mathematics", url: "https://www.youtube.com/watch?v=OmJ-4B-mS-Y" },
      { title: "The Map of Physics", url: "https://www.youtube.com/watch?v=ZihywtixUYo" },
      { title: "The Map of Computer Science", url: "https://www.youtube.com/watch?v=SzJ46YA_RaA" },
      { title: "The Map of Chemistry", url: "https://www.youtube.com/watch?v=P3RXtoYCW4M" },
      { title: "The Map of Biology", url: "https://www.youtube.com/watch?v=p5zngnK37yQ" },
      { title: "A Brief History of Everything", url: "https://www.youtube.com/watch?v=wg1fs6vp9Ok" }
    ],
    "Interdisciplinary": [
      { title: "What is Bioengineering?", url: "https://www.youtube.com/watch?v=1b-Vd2Z305I" },
      { title: "The Physics of Biology", url: "https://www.youtube.com/watch?v=8mBJUQ5G2Hk" },
      { title: "Quantum Computing Explained", url: "https://www.youtube.com/watch?v=JhHMJCUmq28" },
      { title: "The Mathematics of Music", url: "https://www.youtube.com/watch?v=zAxT0mRGuoY" }
    ],
    "Emerging Tech": [
      { title: "What is Nanotechnology?", url: "https://www.youtube.com/watch?v=qUEfx7uS5Gg" },
      { title: "Introduction to Brain-Computer Interfaces", url: "https://www.youtube.com/watch?v=7sjoNKk66qE" },
      { title: "CRISPR Explained", url: "https://www.youtube.com/watch?v=UKbrwPL3wXE" },
      { title: "The Future of Space Exploration", url: "https://www.youtube.com/watch?v=cMqjN_jU51U" }
    ]
  }
};
