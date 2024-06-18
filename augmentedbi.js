importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.4.0-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.4.4/dist/wheels/panel-1.4.4-py3-none-any.whl', 'pyodide-http==0.2.1', 'PIL', 'hvplot', 'pandas', 'pandasai', 'param']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  \nimport asyncio\n\nfrom panel.io.pyodide import init_doc, write_doc\n\ninit_doc()\n\nimport os\nimport pandasai\nfrom pandasai import SmartDataframe\nfrom pandasai import Agent\nimport pandas as pd\nimport re \nimport io\nfrom io import StringIO\nimport panel as pn\nimport hvplot.pandas\nimport time\nimport base64\nimport param\nfrom PIL import Image, ImageDraw\nfrom pandasai.responses.streamlit_response import StreamlitResponse\n\nuser_defined_path = os.getcwd()\n\npn.extension(sizing_mode="stretch_width", template="bootstrap")\npn.extension('tabulator')\npn.state.template.param.update(site="Panel", title="Ask PandasAI - Viz in Panel")\n\npn.config.throttled = True\nos.environ["PANDASAI_API_KEY"] = "$2a$10$saeJXE9i89OiGDDHbGSqlOQyiXwfrvJ1RoG9iXvKgoCoqdXMh3jeG"\n  \nselect = pn.widgets.Select(name='Select a df', options={\n    'Penguins': 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/penguins.csv',\n    'Diamonds': 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/diamonds.csv',\n    'Titanic': 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv',\n    'MPG': 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/mpg.csv',\n    'Vulnerabilities': 'https://raw.githubusercontent.com/UoB-RITICS/cpsiotsec2020-dataset/master/cpsiot2020-cpe_listing.csv'\n}, align=('center'))\n\npd_img=pn.pane.Image('https://miro.medium.com/v2/resize:fit:250/format:webp/1*oHz4ylE7Dzf8BYt12PKFog.png', width=250, height=250)\npn_img=pn.pane.Image('https://panel.holoviz.org/_static/logo_horizontal_light_theme.png', width=350, height=100)\ncustom_style = {\n    'background': '#000000',\n    'border': '1px solid black'\n    \n    \n}\n\ncss = """\ndiv:nth-child(2){\n  --background-color: black;\n \n}\n"""\n\nkf_query = pn.widgets.TextInput(name='Query your df', value='Dataframe first 3 rows', height=50, align=('center'))\nkf_res = pn.widgets.StaticText(name='PANDAS AI answer', value='Waiting for a query', height=100,visible=False)\nkf_des = pn.widgets.StaticText(name='Dataset description', value='Exploring the dataset', height=100 )\ntab_df = pn.widgets.DataFrame(pd.DataFrame(), show_index=False, stylesheets=[css],frozen_rows=3)\npng_pane = pn.pane.Image('https://panel.holoviz.org/_static/logo_horizontal_light_theme.png',visible=False)\nstr_pane = pn.pane.Str(\n    'Select a dataset and start exploring your data',\n    styles={'font-size': '24pt',  'font-family': 'Copperplate'}\n)  \n\n@pn.depends(kf_query.param.value)\n\n\ndef df_cr(csv_path):\n    inp = pd.read_csv(csv_path)\n\n    return inp\n\n\ndef explore(csv):\n    \n    try:\n        df = df_cr(csv)\n    except (TypeError, ValueError):\n        df=csv.iloc[: , 1:]\n        \n    explorer = hvplot.explorer(df)\n    def plot_code(**kwargs):\n        code = f'\`\`\`python\\n{explorer.plot_code()}\\n\`\`\`'\n        return pn.pane.Markdown(code, sizing_mode='stretch_width')\n    return pn.Column(\n        explorer,\n        '**Code**:',\n        pn.bind(plot_code, **explorer.param.objects())\n    )\n\n        \nrun_input = pn.widgets.Button(\n    \n    name="Press to query",\n    icon="caret-right",\n    button_type="primary",\n    width=250,\n    height=50,\n    align=('end'),\n    description='Ask PANDASAI',\n)\n\nresetrs=pn.widgets.Button(\n    name="Reset",\n    icon="restore",\n    button_type="danger",\n    width=50,\n    visible=False,\n)\n\n    \nres=pd.DataFrame()\ndef run_ai(running, csv, query):\n    \n    df = df_cr(csv) \n    \n    sdf = SmartDataframe(df)\n    agent = Agent(sdf)    \n    res=agent.chat(query)\n    time.sleep(10)\n    \n    kf_res.param.update(value=res)\n    \n    \n    tab_df.param.update(value=res)\n    \n\n\ndef des_ai(csvds):\n    \n    df = df_cr(csvds) \n\n    sdf = SmartDataframe(df)\n    agentdes = Agent(sdf)\n    desquery='Provide a brief description of what is the semantic content of the dataframe'\n    des=agentdes.chat(desquery)\n    time.sleep(15)\n    \n    kf_des.param.update(value=des)\n    return pn.Column(kf_des)\n   \n\n\n\ndef update_img(runner, query, dataframe):\n    \n    df=dataframe\n    sdf = SmartDataframe(\n        df,\n        config={\n        \n            "save_charts": True\n        \n        }\n    ,)\n   \n    agentviz = Agent(\n        sdf, description="Your main goal is to create plots and return png images",\n        config={"verbose": True, "response_parser": StreamlitResponse},\n    )\n    vizpng='first clear the previous plot, then plot the answer to the following question: '+ query\n    resviz=agentviz.chat(vizpng)\n   \n    url='C:/Users/csasusr01/exports/charts/temp_chart.png'\n    img = Image.open(url)\n \n    png_pane.param.update(object=img)\n    return\n    \n    \n        \n\n@pn.depends(selection=kf_query.param.value, watch=True)\ndef _visibility(selection):\n    resetrs.visible = selection != "Dataframe first 3 rows"\n    output.visible=selection == "Dataframe first 3 rows"\n    tab_df.visible=selection == "Dataframe first 3 rows"\n    kf_res.visible = selection != "Dataframe first 3 rows"\n    kf_des.visible = selection == "Dataframe first 3 rows"\n    png_pane.visible= selection != "Dataframe first 3 rows"\n    \nwidgets = pn.Column( pn.Row( pn_img,pd_img),\n    str_pane,\n    pn.Row(\n        select,\n        #upload,\n        kf_query,\n        run_input,),\n                   \n        pn.Row(pn.Column(kf_res, pn.Row(pn.panel(png_pane), resetrs,)),\n       tab_df),\n).servable() \n\n\ndescriptionai=pn.panel(pn.bind(des_ai, select)).servable()\noutput = pn.panel(pn.bind(explore, select)).servable()\n\noutput2=pn.panel(pn.bind(run_ai, run_input, select,  kf_query.param.value)).servable()\noutput3= pn.panel(pn.bind(update_img, run_input, kf_query.param.value,  select)).servable()\n\ndef b(event):\n    \n    png_pane.param.update(object='C:/Users/csasusr01/exports/charts/temp_chart.png')\n    \n\n\n\n\ndef c(event):\n    \n    png_pane.visible= not png_pane.visible\n       \n    kf_query.param.update(value='Dataframe first 3 rows')\n    \n\n\nrun_input.on_click(b)\nresetrs.on_click(c)\npn.Column(widgets,descriptionai, output)\n\n\nawait write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    from panel.io.pyodide import _convert_json_patch
    state.curdoc.apply_json_patch(_convert_json_patch(patch), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()