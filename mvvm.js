class MVVM{
    constructor(options){
        this.$options = options
        this.$data = options.data
        this.$el = options.el
        if(this.$el){
            // 1. 数据代理，将data中的数据代理到vm实例上
            _proxy(this, this.$data)
            // 2. 数据劫持，把data中的数据变成响应式数据
            new Observer(this.$data, this)
            // 3. 编译模板，elementNode： 主要是指定 v-bind,html,model,text...; textNode: {{}}表达式
            // 模板的概念： 带有特定表达式和指令的html字符串
            new Compiler(this.$el, this)
        }
    }
}

// 数据代理
function _proxy(vm, obj){
    Object.keys(obj).forEach(key => {
        Object.defineProperty(vm, key, {
            configurable: false,
            enumerable: true,
            get(){
              return obj[key]
            },
            set(newVal){
              obj[key] = newVal
            }
        })
    })
}

class Observer{
    constructor(data){
        this.observe(data)
    }

    observe(obj){
        if(isObject(obj)){
            Object.keys(obj).forEach(key => {
                this._defineProperty(obj, key, obj[key])
            })
        }
    }
    _defineProperty(obj, key, value){
        this.observe(value)
        // 给每个属性都添加一个发布订阅的功能
        let sub = new Subs()
        Object.defineProperty(obj, key, {
        
            get(){
              // new Wacher的时候会获取一次旧的值，触发get， 订阅
              Subs.target && sub.addSub(Subs.target)
              return value
            },
            set:(newVal)=>{
              if(value !== newVal) {
                this.observe(newVal)
                // 这里一定要写： value = newVlue 不能写： obj[key] = newValue,否则会递归调用
                value = newVal
                // 发布订阅: 一定要在值改变后发布订阅，发布订阅的意思就是更新值，更新值的前提是值已经更新了
                sub.notify()
              }
            }
        })
    }
}
function isObject(value){
    return typeof value === 'object' && value !== null
}
// 判断元素节点
function isElementNode(node) {
    return node.nodeType === 1
}
// 判断文本节点
function isTextNode(node){
    return node.nodeType === 3
}
/*
    编译的逻辑： 
    1. 拿到模板（内存中的模板）
    2. 编译模板（用数据（vm.$data）去编译模板（fragment））
*/ 
class Compiler{
    constructor(el, vm){
        // 判断el是元素还是字符串
        this.$el = isElementNode(el) ? el: document.querySelector(el)
        this.$vm = vm
        // 1. 将el中的node节点放到内存中
        let fragment = this.node2Fragment(this.$el)
        // 2. 编译
        this.compiler(fragment, el, vm)
        // 3. 重新放到页面中
        this.$el.appendChild(fragment)
    }
    // 将指定节点中的所有元素放到内存中
    node2Fragment(node){
        // 创建文档碎片
        let fragment = document.createDocumentFragment()
        let firstChild;
        while(firstChild = node.firstChild){
            fragment.appendChild(firstChild)
        }
        return fragment;
    }
    compiler(fragment, el, vm){
        let childNodes = fragment.childNodes;
        [...childNodes].forEach(node => {
            // 元素节点：1. v-开头的指令 2. 子节点
            if(isElementNode(node)){
                // 拿到元素节点后，要拿到这个元素的所有属性，从属性中过滤那些是指令
                this.compileElementNode(node, el, vm)
                this.compiler(node, el, vm)
            }else if(isTextNode(node)){
                // 文本节点： {{a}} {{b}}
                let expr = node.textContent
                this.compileTextNode(node, expr, vm)
            }
        })
    }
    // 编译文本节点
    compileTextNode(node, expr, vm){
        let fn = compileUtils['updater']['textNode']
        // {{name}} {{age}}  这整体是这个节点的value， 将所有的{{expr}}都替换完成后，再设置node的textContent
        let val = expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
            // 实例化watcher
            new Watcher(vm, args[1], ()=>{
                // 编译
                fn(node, compileUtils['getContentVal'](vm, expr))
            })

            let value = compileUtils['getVal'](vm, args[1])
            return value
        })
       fn(node, val)
    }
    // 编译元素节点的
    compileElementNode(node){
        // 获取改元素节点的所以自定义属性attributes
        let attrs = node.attributes;
        [...attrs].forEach(attr => {
            let {name, value:expr} = attr
            // 判断是不是指令
            if(isDirective(name)){
               // 是指令，是哪个指令，根据不同的指令，做不同的操作
               //获取指令的名称
               let [, directiveName] = name.split('-')
               // 编译
               compileUtils[directiveName](node, this.$vm, expr)
            }
        })
    }
}
// 是否是指令
function isDirective(name){
    return name.startsWith('v-')
}

// 编译工具
let compileUtils = {
    // expr: a.b.c
    getVal(vm, expr){
        return expr.split('.').reduce((prev, current) =>{
            return prev[current]
        }, vm.$data)
    },
    getContentVal(vm, expr){
        console.log(vm, expr)
        let val = expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
            return this['getVal'](vm, args[1])
        })
        return val
    },
    // 设置vm.$data的值
    setValue(vm, expr, value){
        expr.split('.').reduce((prev, current, index, arr) =>{
            if(index === arr.length -1){
                return prev[current] = value
            }
            return prev[current]
        }, vm.$data)
    },
    // 编译 v-model指令
    model(node, vm, expr){
        // 实例化watcher
        new Watcher(vm, expr, (newVal)=>{
            // 编译
            this.updater['modelUploader'](node, newVal)
        })
        // 获取表达式的值
        let value = this['getVal'](vm, expr)
        // 双向数据绑定
        node.addEventListener('input', (e)=>{
            // 设置值：设置vm.$data中的数据
            this.setValue(vm, expr, e.target.value)
        })
        this.updater['modelUploader'](node, value)
    },
    // 编译v-html指令
    html(node, vm, expr){
        // 实例化watcher
        new Watcher(vm, expr, (newVal)=>{
            // 编译
            this.updater['htmlUploader'](node, newVal)
        })
        let value = this.getVal(vm, expr)

        this.updater['htmlUploader'](node, value)
    },
    updater:{
        modelUploader(node, value){
            node.value = value
        },
        htmlUploader(node, value){
            node.innerHTML = value
        },
        // 更新文本节点的值
        textNode: (node, value) => {
            node.textContent = value
        }
    }
}

// 发布订阅
// vm.$watcher(vm, 'obj.a', (newVal){})
class Watcher{
    constructor(vm, expr, cb){
        this.vm = vm 
        this.expr = expr
        this.cb = cb
        // 初始化的时候先获取一次旧的值
        this.oldValue = this.get(this.vm, this.expr)
    }
    // 获取值
    get(vm, expr){
         // 触发Observer类的get方法前将自己的实例存到Subs静态属性上
         Subs.target = this
         let value = compileUtils['getVal'](vm, expr)
         // 移除实例
         Subs.target = null
        return value
    }

    update(){
        let newValue = compileUtils['getVal'](this.vm, this.expr)
        if(newValue !== this.oldValue){
            this.cb(newValue)
        }
    }
}

class Subs{
    constructor(){
        this.Subs = []
       
    }
    // 订阅
    addSub(watcher){
        this.Subs.push(watcher)
    }
    // 发布
    notify(){
        this.Subs.forEach(watcher => watcher.update())
    }
}